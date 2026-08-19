import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  Block,
  Follow,
  FollowRequest,
  ModerationLogEntry,
  Mute,
  Report,
  type ReportReason,
} from '@patches/database';
import { dateToTimestamp } from '@patches/proto';
import type {
  ListModerationLogResponse,
  ListMyModerationNoticesResponse,
} from '@patches/proto/nest';
import { DataSource, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { ActorSummary } from '../auth/auth.dto.js';
import { toActorSummary } from '../auth/auth.dto.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import type { RelationshipView } from '../graph/graph.dto.js';
import { MessagesService } from '../messages/messages.service.js';
import { PostService } from '../posts/post.service.js';
import { parseInput, uuidInputSchema } from '../posts/validation.js';
import {
  toProtoActionType,
  toProtoReasonCategory,
  toProtoSubjectKind,
} from './moderation.mapper.js';
import { queryNoticeRows, toModerationNotice } from './notice-projection.js';

/**
 * The application service behind `patches.v1.ModerationService` (spec §55, §61–64, Phase 6
 * spec §140). `follows`/`blocks`/`mutes` were created in Phase 3 (`GraphService` already reads
 * them for `FollowActor`/`GetRelationship`); this is the first thing that ever *writes*
 * `blocks`/`mutes`.
 */

const MAX_REPORT_DETAILS_LENGTH = 2000;

export interface ListActorsResult {
  actors: ActorSummary[];
  nextCursor: string;
  hasMore: boolean;
}

@Injectable()
export class ModerationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly posts: PostService,
    private readonly messages: MessagesService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Idempotent: blocking an already-blocked actor is not an error. Removes any existing follow
   * in either direction (spec §62 — "B should not follow A", "existing follow relationship
   * should be removed").
   */
  async blockActor(actorId: string, targetActorIdRaw: string): Promise<RelationshipView> {
    const targetActorId = parseActorId(targetActorIdRaw);
    if (targetActorId === actorId) throw AppError.validation('You cannot block yourself.');

    return this.dataSource.transaction(async (manager) => {
      const target = await manager.getRepository(Actor).findOne({ where: { id: targetActorId } });
      if (target === null || target.deletedAt !== null) throw actorNotFound();

      const blocks = manager.getRepository(Block);
      const existing = await blocks.findOne({
        where: { blockerActorId: actorId, blockedActorId: targetActorId },
      });
      if (existing === null) {
        try {
          await blocks.save(
            blocks.create({ blockerActorId: actorId, blockedActorId: targetActorId }),
          );
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }

      await manager.getRepository(Follow).delete([
        { followerActorId: actorId, followeeActorId: targetActorId },
        { followerActorId: targetActorId, followeeActorId: actorId },
      ]);

      return this.relationshipFor(manager, actorId, targetActorId);
    });
  }

  /** Idempotent: unblocking an actor the caller has not blocked is not an error. */
  async unblockActor(actorId: string, targetActorIdRaw: string): Promise<RelationshipView> {
    const targetActorId = parseActorId(targetActorIdRaw);
    return this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(Block)
        .delete({ blockerActorId: actorId, blockedActorId: targetActorId });
      return this.relationshipFor(manager, actorId, targetActorId);
    });
  }

  /** Idempotent: muting an already-muted actor is not an error. Does not touch any existing
   * follow (spec §63 — "does not remove follow automatically"). */
  async muteActor(actorId: string, targetActorIdRaw: string): Promise<RelationshipView> {
    const targetActorId = parseActorId(targetActorIdRaw);
    if (targetActorId === actorId) throw AppError.validation('You cannot mute yourself.');

    return this.dataSource.transaction(async (manager) => {
      const target = await manager.getRepository(Actor).findOne({ where: { id: targetActorId } });
      if (target === null || target.deletedAt !== null) throw actorNotFound();

      const mutes = manager.getRepository(Mute);
      const existing = await mutes.findOne({
        where: { muterActorId: actorId, mutedActorId: targetActorId },
      });
      if (existing === null) {
        try {
          await mutes.save(mutes.create({ muterActorId: actorId, mutedActorId: targetActorId }));
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }
      return this.relationshipFor(manager, actorId, targetActorId);
    });
  }

  /** Idempotent: unmuting an actor the caller has not muted is not an error. */
  async unmuteActor(actorId: string, targetActorIdRaw: string): Promise<RelationshipView> {
    const targetActorId = parseActorId(targetActorIdRaw);
    return this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(Mute)
        .delete({ muterActorId: actorId, mutedActorId: targetActorId });
      return this.relationshipFor(manager, actorId, targetActorId);
    });
  }

  /** The caller's own block list, most-recent first. */
  async listBlocks(actorId: string, cursorRaw: string, limit: number): Promise<ListActorsResult> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(Block)
      .createQueryBuilder('block')
      .innerJoinAndSelect('block.blockedActor', 'related')
      .where('block.blockerActorId = :actorId', { actorId })
      .orderBy('block.createdAt', 'DESC')
      .addOrderBy('block.blockedActorId', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(block.createdAt, block.blockedActorId) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const actors = page.map((row) => toActorSummary(row.blockedActor));
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.blockedActorId,
    }));
    return { actors, nextCursor, hasMore };
  }

  /** The caller's own mute list, most-recent first. */
  async listMutes(actorId: string, cursorRaw: string, limit: number): Promise<ListActorsResult> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(Mute)
      .createQueryBuilder('mute')
      .innerJoinAndSelect('mute.mutedActor', 'related')
      .where('mute.muterActorId = :actorId', { actorId })
      .orderBy('mute.createdAt', 'DESC')
      .addOrderBy('mute.mutedActorId', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(mute.createdAt, mute.mutedActorId) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const actors = page.map((row) => toActorSummary(row.mutedActor));
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.mutedActorId,
    }));
    return { actors, nextCursor, hasMore };
  }

  /** Bounded report of a post (spec §64); rate-limited by `ModerationController`. Reuses
   * `PostService.getPost`'s uniform `POST_NOT_FOUND` for a missing/deleted/blocked-either-
   * direction post (§62) — a report about a post you cannot see is not actionable. */
  async reportPost(
    reporterActorId: string,
    postIdRaw: string,
    reason: ReportReason,
    details: string,
  ): Promise<string> {
    const postId = parseInput(uuidInputSchema, postIdRaw);
    await this.posts.getPost(postId, reporterActorId);

    const reports = this.dataSource.getRepository(Report);
    const saved = await reports.save(
      reports.create({
        reporterActorId,
        subjectType: 'POST',
        subjectPostId: postId,
        reason,
        details: normalizeDetails(details),
      }),
    );
    return saved.id;
  }

  /** Bounded report of an actor (spec §64); rate-limited by `ModerationController`. */
  async reportActor(
    reporterActorId: string,
    targetActorIdRaw: string,
    reason: ReportReason,
    details: string,
  ): Promise<string> {
    const targetActorId = parseActorId(targetActorIdRaw);
    if (targetActorId === reporterActorId) {
      throw AppError.validation('You cannot report yourself.');
    }
    const target = await this.dataSource
      .getRepository(Actor)
      .findOne({ where: { id: targetActorId } });
    if (target === null || target.deletedAt !== null) throw actorNotFound();

    const reports = this.dataSource.getRepository(Report);
    const saved = await reports.save(
      reports.create({
        reporterActorId,
        subjectType: 'ACTOR',
        subjectActorId: targetActorId,
        reason,
        details: normalizeDetails(details),
      }),
    );
    return saved.id;
  }

  /**
   * Captures bounded, point-in-time evidence for a DM report (spec §183.4). A missing
   * message and a message outside one of the caller's active conversations are deliberately
   * indistinguishable, preserving the same no-oracle rule as the DM read paths.
   */
  async reportMessage(
    reporterActorId: string,
    messageIdRaw: string,
    reason: ReportReason,
    details: string,
  ): Promise<string> {
    const messageId = parseInput(uuidInputSchema, messageIdRaw);

    const evidence = await this.messages.snapshotMessageForReport(reporterActorId, messageId);
    const reports = this.dataSource.getRepository(Report);
    const saved = await reports.save(
      reports.create({
        reporterActorId,
        subjectType: 'MESSAGE',
        subjectMessageId: evidence.messageId,
        messageSnapshot: evidence.snapshot,
        reason,
        details: normalizeDetails(details),
      }),
    );
    return saved.id;
  }

  /**
   * The public, anonymized transparency log (spec §201.4) — unauthenticated, keyset-paginated
   * over `moderation_log_entries`. `patches-admin domain block` (P14-012), `user suspend|delete`,
   * and `report resolve --action remove-post|suspend` (P14-027, `apps/admin/src/commands/
   * {domain,user,report}.ts`) all write rows here today.
   */
  async listModerationLog(cursorRaw: string, limit: number): Promise<ListModerationLogResponse> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(ModerationLogEntry)
      .createQueryBuilder('entry')
      .orderBy('entry.createdAt', 'DESC')
      .addOrderBy('entry.id', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(entry.createdAt, entry.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));

    return {
      entries: page.map((row) => ({
        id: row.id,
        action: toProtoActionType(row.action),
        subjectKind: toProtoSubjectKind(row.subjectKind),
        subjectDomain: row.subjectDomain ?? '',
        reasonCategory: toProtoReasonCategory(row.reasonCategory),
        appealed: row.appealed,
        createdAt: dateToTimestamp(row.createdAt),
      })),
      page: { nextCursor, hasMore },
    };
  }

  /** The caller's own moderation notices (spec §201.2) — a live read projection of
   * `admin_audit_log`, not a second source of truth; see `notice-projection.ts`'s doc comment
   * for exactly which rows are notice-worthy today. */
  async listMyModerationNotices(
    actorId: string,
    cursorRaw: string,
    limit: number,
  ): Promise<ListMyModerationNoticesResponse> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const rows = await queryNoticeRows(this.dataSource, actorId, cursor, take + 1);
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));

    return {
      notices: page.map((row) => toModerationNotice(row, this.config.appealWindowDays)),
      page: { nextCursor, hasMore },
    };
  }

  // ---------------------------------------------------------------- internals

  private async relationshipFor(
    manager: EntityManager,
    viewerActorId: string,
    targetActorId: string,
  ): Promise<RelationshipView> {
    const follows = manager.getRepository(Follow);
    const followRequests = manager.getRepository(FollowRequest);
    const [outbound, inbound, blockingRow, mutingRow, requestedRow, requestedByRow] =
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
        // §197.5: a pending `follow_requests` row toward a locked `targetActorId`, distinct
        // from the federation-handshake `PENDING` a `Follow` row itself can carry (see
        // `FollowRequest`'s entity doc) — same fields `GraphService`'s own relationship view
        // now carries, so `ModerationService.blockActor`/`muteActor`'s `RelationshipView`
        // return value stays consistent with `GraphService.getRelationship`'s.
        followRequests.findOne({
          where: { requesterActorId: viewerActorId, targetActorId },
        }),
        followRequests.findOne({
          where: { requesterActorId: targetActorId, targetActorId: viewerActorId },
        }),
      ]);

    return {
      state: outbound === null ? 'NONE' : outbound.status,
      followedBy: inbound !== null,
      blocking: blockingRow !== null,
      muting: mutingRow !== null,
      requested: requestedRow !== null,
      requestedBy: requestedByRow !== null,
    };
  }
}

function parseActorId(value: string): string {
  return parseInput(uuidInputSchema, value);
}

function actorNotFound(): AppError {
  return new AppError('ACTOR_NOT_FOUND', 'That actor does not exist.');
}

function normalizeDetails(details: string): string | null {
  const trimmed = details.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_REPORT_DETAILS_LENGTH) {
    throw AppError.validation(
      `details must be at most ${String(MAX_REPORT_DETAILS_LENGTH)} characters`,
    );
  }
  return trimmed;
}

/** PostgreSQL's `unique_violation` SQLSTATE, surfaced by `pg` as a plain `{ code: string }` —
 * same helper `GraphService`/`PostService` use for their own idempotency races. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
