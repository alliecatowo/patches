import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor, ActorPrivacyPrefs, Block, Follow, FollowRequest, Mute } from '@patches/database';
import { z } from 'zod';
import { DataSource, type EntityManager } from 'typeorm';

import { getRequestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { toActorProfile } from '../actors/actor.dto.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import { FEDERATION_GATEWAY, type FederationGateway } from '../federation/federation-gateway.js';
import { FollowRequestRateLimitService } from './follow-request-rate-limit.service.js';
import { NotificationsService } from '../notifications/notification.service.js';
import type {
  FollowActorResult,
  FollowRequestView,
  ListFollowRequestsResult,
  RelationshipView,
} from './graph.dto.js';

const uuidInputSchema = z.uuid('must be a valid id');

function parseActorId(value: string): string {
  const result = uuidInputSchema.safeParse(value);
  if (!result.success) throw AppError.validation('actor_id must be a valid id.');
  return result.data;
}

/**
 * The application service behind `patches.v1.SocialGraphService` (spec §50, §61–63,
 * Amendment C §197.5).
 *
 * `MuteActor`/`UnmuteActor`/`BlockActor`/`UnblockActor` are Phase 6 (spec §140, deferred per
 * `docs/architecture/api.md`) — this only ever *reads* `blocks`/`mutes` (for `GetRelationship`
 * and to reject a blocked `FollowActor`), never writes them.
 *
 * §197.5's locked-account follow requests live in their own `follow_requests` table, not a
 * third `follows.status` value — see `follow-request.entity.ts`'s doc comment for why
 * conflating them with the pre-existing remote-federation `PENDING` status would be wrong.
 */
@Injectable()
export class GraphService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    @Inject(FEDERATION_GATEWAY) private readonly federation: FederationGateway,
    private readonly followRequestRateLimit: FollowRequestRateLimitService,
  ) {}

  /**
   * v0 local accounts transition straight to `FOLLOWING` (spec §50) — idempotent (following an
   * already-followed actor is a no-op, not an error) and self-follow/blocked-either-direction
   * are rejected.
   *
   * A **locked** local actor (§197.5) is the one exception: this creates a pending
   * `FollowRequest` instead of a `Follow` row, notifies the target, and never auto-accepts.
   * Also idempotent — calling this again while a request is already pending just returns the
   * same outstanding-request result, no second notification.
   *
   * Following a **remote** actor (P8-002/P8-003) instead stays `PENDING` until that actor's
   * node sends back `Accept` — `InboxService` flips it to `FOLLOWING` on receipt. The `Follow`
   * activity delivery is enqueued in the same transaction as the row write
   * (`FederationGateway.followRemoteActor`), so "follow row created, no delivery job" can
   * never happen; `NoopFederationGateway` makes this a no-op when federation is disabled.
   */
  async followActor(viewerActorId: string, targetActorIdRaw: string): Promise<FollowActorResult> {
    const targetActorId = parseActorId(targetActorIdRaw);
    if (targetActorId === viewerActorId) {
      throw AppError.validation('You cannot follow yourself.');
    }

    // §197.5's "rate-limited" requirement applies to the request-creation path only — checked
    // ahead of the write transaction, same pattern `PrivacyService`'s abuse-sensitive write
    // paths use, since `DbRateLimitStore` is always its own connection regardless of an
    // enclosing transaction (see `docs/agents/LEARNINGS.md` on cross-connection self-deadlock).
    // A stale read here (the target unlocks/locks between this check and the transaction below)
    // only ever costs one avoidable rate-limit consumption — never a correctness issue, since
    // the transaction re-checks `locked` itself before writing anything.
    if (await this.isLockedLocalTarget(targetActorId)) {
      const peer = getRequestContext()?.peer;
      await this.followRequestRateLimit.consume(viewerActorId, peer);
    }

    const { relationship, created, requestCreated, requested } = await this.dataSource.transaction(
      async (manager) => {
        const target = await manager.getRepository(Actor).findOne({ where: { id: targetActorId } });
        if (target === null || target.deletedAt !== null) throw actorNotFound();

        if (await this.blockedEitherDirection(manager, viewerActorId, targetActorId)) {
          throw new AppError('ACTOR_BLOCKED', 'You cannot follow this actor.');
        }

        const follows = manager.getRepository(Follow);
        const existingFollow = await follows.findOne({
          where: { followerActorId: viewerActorId, followeeActorId: targetActorId },
        });
        if (existingFollow !== null) {
          return {
            relationship: await this.relationshipFor(manager, viewerActorId, targetActorId),
            created: false,
            requestCreated: false,
            requested: false,
          };
        }

        const locked = target.isLocal && (await this.isLocked(manager, targetActorId));
        if (locked) {
          const requests = manager.getRepository(FollowRequest);
          const existingRequest = await requests.findOne({
            where: { requesterActorId: viewerActorId, targetActorId },
          });
          let requestCreated = false;
          if (existingRequest === null) {
            try {
              await requests.save(
                requests.create({ requesterActorId: viewerActorId, targetActorId }),
              );
              requestCreated = true;
            } catch (error) {
              // Same race-is-not-an-error reasoning as `Follow`'s unique-violation catch below.
              if (!isUniqueViolation(error)) throw error;
            }
          }
          return {
            relationship: await this.relationshipFor(manager, viewerActorId, targetActorId),
            created: false,
            requestCreated,
            requested: true,
          };
        }

        let created = false;
        try {
          await follows.save(
            follows.create({
              followerActorId: viewerActorId,
              followeeActorId: targetActorId,
              status: target.isLocal ? 'FOLLOWING' : 'PENDING',
              acceptedAt: target.isLocal ? new Date() : null,
            }),
          );
          created = true;
          if (!target.isLocal) {
            await this.federation.followRemoteActor(manager, viewerActorId, targetActorId);
          }
        } catch (error) {
          // Two concurrent FollowActor calls race the (follower_actor_id, followee_actor_id)
          // unique index — the loser just means the row already exists, which is exactly what
          // "idempotent" requires under a race, not an error (spec §45's idempotency reasoning
          // applied here, even though this RPC has no client_request_id of its own).
          if (!isUniqueViolation(error)) throw error;
        }

        return {
          relationship: await this.relationshipFor(manager, viewerActorId, targetActorId),
          created,
          requestCreated: false,
          requested: false,
        };
      },
    );
    // FOLLOW/FOLLOW_REQUEST notifications only on a genuinely new follow/request (A-026's
    // reasoning extended to §197.5), written after the transaction has committed (its own
    // connection — see LEARNINGS on cross-connection locks).
    if (created) await this.notifications.notifyFollow(targetActorId, viewerActorId);
    if (requestCreated) await this.notifications.notifyFollowRequest(targetActorId, viewerActorId);
    return { relationship, requested };
  }

  /** Idempotent: unfollowing an actor the caller does not follow is not an error. Delivers
   * `Undo(Follow)` when the (former) followee is remote (P8-002/P8-003). Also cancels a
   * pending follow request the caller has outstanding toward this actor (§197.5) — this is
   * the RPC a client calls for "cancel my follow request", too, since there is nothing left to
   * follow/unfollow once a request is withdrawn either way. */
  unfollowActor(viewerActorId: string, targetActorIdRaw: string): Promise<RelationshipView> {
    const targetActorId = parseActorId(targetActorIdRaw);

    return this.dataSource.transaction(async (manager) => {
      const target = await manager.getRepository(Actor).findOne({ where: { id: targetActorId } });
      const result = await manager
        .getRepository(Follow)
        .delete({ followerActorId: viewerActorId, followeeActorId: targetActorId });
      if ((result.affected ?? 0) > 0 && target !== null && !target.isLocal) {
        await this.federation.unfollowRemoteActor(manager, viewerActorId, targetActorId);
      }
      await manager
        .getRepository(FollowRequest)
        .delete({ requesterActorId: viewerActorId, targetActorId });
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

  /** §197.5: pending follow requests addressed to `recipientActorId`'s own account, newest
   * first. There is no `actor_id` parameter — a caller only ever sees their own request
   * queue. */
  async listFollowRequests(
    recipientActorId: string,
    cursorRaw: string,
    limit: number,
  ): Promise<ListFollowRequestsResult> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(FollowRequest)
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.requesterActor', 'requester')
      .where('request.targetActorId = :recipientActorId', { recipientActorId })
      .orderBy('request.createdAt', 'DESC')
      .addOrderBy('request.id', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(request.createdAt, request.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const requests: FollowRequestView[] = page.map((row) => ({
      // Counts left zeroed — a list-row summary, not `GetActor`'s guarantee, same convention
      // `ActorService.listFollowers`/`listFollowing` already use.
      actor: toActorProfile(row.requesterActor, { followers: 0, following: 0, posts: 0 }),
      createdAt: row.createdAt,
    }));
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { requests, nextCursor, hasMore };
  }

  /**
   * Accepts a pending follow request from `requesterActorIdRaw` addressed to
   * `recipientActorId`: creates the `FOLLOWING` `Follow` row and removes the request row in
   * the same transaction — never auto-accepted, always an explicit call (spec §197.5).
   * `FOLLOW_REQUEST_NOT_FOUND` if no such pending request exists. Notifies the requester (not
   * the accepting actor) that their request went through.
   */
  async acceptFollowRequest(
    recipientActorId: string,
    requesterActorIdRaw: string,
  ): Promise<RelationshipView> {
    const requesterActorId = parseActorId(requesterActorIdRaw);

    const relationship = await this.dataSource.transaction(async (manager) => {
      const requests = manager.getRepository(FollowRequest);
      const request = await requests.findOne({
        where: { requesterActorId, targetActorId: recipientActorId },
      });
      if (request === null) throw followRequestNotFound();

      await requests.delete({ id: request.id });

      const follows = manager.getRepository(Follow);
      try {
        await follows.save(
          follows.create({
            followerActorId: requesterActorId,
            followeeActorId: recipientActorId,
            status: 'FOLLOWING',
            acceptedAt: new Date(),
          }),
        );
      } catch (error) {
        // A `Follow` row already existing here would mean the requester somehow both followed
        // and had a pending request outstanding at once — `followActor` never allows that, but
        // treat a race the same idempotent way every other write path here does rather than
        // failing the accept.
        if (!isUniqueViolation(error)) throw error;
      }

      return this.relationshipFor(manager, recipientActorId, requesterActorId);
    });

    await this.notifications.notifyFollow(requesterActorId, recipientActorId);
    return relationship;
  }

  /**
   * Rejects (discards) a pending follow request from `requesterActorIdRaw` addressed to
   * `recipientActorId` — no `Follow` row is ever created. `FOLLOW_REQUEST_NOT_FOUND` if no
   * such pending request exists. Deliberately does not notify the requester: unlike an accept,
   * telling someone they were specifically declined has no legitimate use a silent absence
   * doesn't already serve, and is a plausible harassment vector (same reasoning §62 already
   * applies to blocks never being disclosed to the blocked party).
   */
  async rejectFollowRequest(recipientActorId: string, requesterActorIdRaw: string): Promise<void> {
    const requesterActorId = parseActorId(requesterActorIdRaw);

    const result = await this.dataSource
      .getRepository(FollowRequest)
      .delete({ requesterActorId, targetActorId: recipientActorId });
    if ((result.affected ?? 0) === 0) throw followRequestNotFound();
  }

  // ---------------------------------------------------------------- internals

  private async relationshipFor(
    manager: EntityManager,
    viewerActorId: string,
    targetActorId: string,
  ): Promise<RelationshipView> {
    const follows = manager.getRepository(Follow);
    const followRequests = manager.getRepository(FollowRequest);
    const [outbound, inbound, blockingRow, mutingRow, outboundRequest, inboundRequest] =
      await Promise.all([
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
        followRequests.findOne({
          where: { requesterActorId: viewerActorId, targetActorId },
        }),
        followRequests.findOne({
          where: { requesterActorId: targetActorId, targetActorId: viewerActorId },
        }),
      ]);

    const requested = outbound === null && outboundRequest !== null;

    return {
      state: outbound === null ? (requested ? 'PENDING' : 'NONE') : outbound.status,
      followedBy: inbound !== null,
      blocking: blockingRow !== null,
      muting: mutingRow !== null,
      requested,
      requestedBy: inboundRequest !== null,
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

  private async isLockedLocalTarget(targetActorId: string): Promise<boolean> {
    const target = await this.dataSource
      .getRepository(Actor)
      .findOne({ where: { id: targetActorId } });
    if (target === null || !target.isLocal) return false;
    return this.isLocked(this.dataSource.manager, targetActorId);
  }

  private async isLocked(manager: EntityManager, actorId: string): Promise<boolean> {
    const prefs = await manager.getRepository(ActorPrivacyPrefs).findOne({ where: { actorId } });
    // Mirrors `PrivacyService`'s own `defaultPrivacyPrefsView` default: no row yet means every
    // control, including `locked`, is still at its default — `false`.
    return prefs?.locked ?? false;
  }
}

function actorNotFound(): AppError {
  return new AppError('ACTOR_NOT_FOUND', 'That actor does not exist.');
}

function followRequestNotFound(): AppError {
  return new AppError('FOLLOW_REQUEST_NOT_FOUND', 'That follow request does not exist.');
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
