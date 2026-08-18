import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor, Block, Follow, Mute } from '@patches/database';
import { z } from 'zod';
import { DataSource, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { NotificationsService } from '../notifications/notification.service.js';
import type { RelationshipView } from './graph.dto.js';

const uuidInputSchema = z.uuid('must be a valid id');

function parseActorId(value: string): string {
  const result = uuidInputSchema.safeParse(value);
  if (!result.success) throw AppError.validation('actor_id must be a valid id.');
  return result.data;
}

/**
 * The application service behind `patches.v1.SocialGraphService` (spec §50, §61–63).
 *
 * `MuteActor`/`UnmuteActor`/`BlockActor`/`UnblockActor` are Phase 6 (spec §140, deferred per
 * `docs/architecture/api.md`) — this only ever *reads* `blocks`/`mutes` (for `GetRelationship`
 * and to reject a blocked `FollowActor`), never writes them.
 */
@Injectable()
export class GraphService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * v0 local accounts transition straight to `FOLLOWING` (spec §50) — idempotent (following an
   * already-followed actor is a no-op, not an error) and self-follow/blocked-either-direction
   * are rejected.
   */
  async followActor(viewerActorId: string, targetActorIdRaw: string): Promise<RelationshipView> {
    const targetActorId = parseActorId(targetActorIdRaw);
    if (targetActorId === viewerActorId) {
      throw AppError.validation('You cannot follow yourself.');
    }

    const { relationship, created } = await this.dataSource.transaction(async (manager) => {
      const target = await manager.getRepository(Actor).findOne({ where: { id: targetActorId } });
      if (target === null || target.deletedAt !== null) throw actorNotFound();

      if (await this.blockedEitherDirection(manager, viewerActorId, targetActorId)) {
        throw new AppError('ACTOR_BLOCKED', 'You cannot follow this actor.');
      }

      const follows = manager.getRepository(Follow);
      const existing = await follows.findOne({
        where: { followerActorId: viewerActorId, followeeActorId: targetActorId },
      });
      let created = false;
      if (existing === null) {
        try {
          await follows.save(
            follows.create({
              followerActorId: viewerActorId,
              followeeActorId: targetActorId,
              status: 'FOLLOWING',
              acceptedAt: new Date(),
            }),
          );
          created = true;
        } catch (error) {
          // Two concurrent FollowActor calls race the (follower_actor_id, followee_actor_id)
          // unique index — the loser just means the row already exists, which is exactly what
          // "idempotent" requires under a race, not an error (spec §45's idempotency reasoning
          // applied here, even though this RPC has no client_request_id of its own).
          if (!isUniqueViolation(error)) throw error;
        }
      }

      return {
        relationship: await this.relationshipFor(manager, viewerActorId, targetActorId),
        created,
      };
    });
    // FOLLOW notification only on a genuinely new follow (A-026), written after the follow
    // transaction has committed (its own connection — see LEARNINGS on cross-connection locks).
    if (created) await this.notifications.notifyFollow(targetActorId, viewerActorId);
    return relationship;
  }

  /** Idempotent: unfollowing an actor the caller does not follow is not an error. */
  async unfollowActor(viewerActorId: string, targetActorIdRaw: string): Promise<RelationshipView> {
    const targetActorId = parseActorId(targetActorIdRaw);

    return this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(Follow)
        .delete({ followerActorId: viewerActorId, followeeActorId: targetActorId });
      return this.relationshipFor(manager, viewerActorId, targetActorId);
    });
  }

  async getRelationship(
    viewerActorId: string,
    targetActorIdRaw: string,
  ): Promise<RelationshipView> {
    const targetActorId = parseActorId(targetActorIdRaw);
    const target = await this.dataSource
      .getRepository(Actor)
      .findOne({ where: { id: targetActorId } });
    if (target === null || target.deletedAt !== null) throw actorNotFound();
    return this.relationshipFor(this.dataSource.manager, viewerActorId, targetActorId);
  }

  // ---------------------------------------------------------------- internals

  private async relationshipFor(
    manager: EntityManager,
    viewerActorId: string,
    targetActorId: string,
  ): Promise<RelationshipView> {
    const follows = manager.getRepository(Follow);
    const [outbound, inbound, blockingRow, mutingRow] = await Promise.all([
      follows.findOne({
        where: { followerActorId: viewerActorId, followeeActorId: targetActorId },
      }),
      follows.findOne({
        where: { followerActorId: targetActorId, followeeActorId: viewerActorId },
      }),
      manager
        .getRepository(Block)
        .findOne({ where: { blockerActorId: viewerActorId, blockedActorId: targetActorId } }),
      manager
        .getRepository(Mute)
        .findOne({ where: { muterActorId: viewerActorId, mutedActorId: targetActorId } }),
    ]);

    return {
      state: outbound === null ? 'NONE' : outbound.status,
      followedBy: inbound !== null,
      blocking: blockingRow !== null,
      muting: mutingRow !== null,
    };
  }

  private async blockedEitherDirection(
    manager: EntityManager,
    actorAId: string,
    actorBId: string,
  ): Promise<boolean> {
    const blocks = manager.getRepository(Block);
    const [aBlocksB, bBlocksA] = await Promise.all([
      blocks.findOne({ where: { blockerActorId: actorAId, blockedActorId: actorBId } }),
      blocks.findOne({ where: { blockerActorId: actorBId, blockedActorId: actorAId } }),
    ]);
    return aBlocksB !== null || bBlocksA !== null;
  }
}

function actorNotFound(): AppError {
  return new AppError('ACTOR_NOT_FOUND', 'That actor does not exist.');
}

/** PostgreSQL's `unique_violation` SQLSTATE, surfaced by `pg` as a plain `{ code: string }` —
 * same helper `PostService.createPost` uses for its own idempotency race. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
