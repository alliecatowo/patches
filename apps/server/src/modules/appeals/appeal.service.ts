import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Appeal } from '@patches/database';
import { MAX_APPEAL_STATEMENT_CHARS, RATE_LIMITS } from '@patches/domain';
import { DataSource } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { enforceWindowRateLimit } from '../../common/rate-limit/window-rate-limiter.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import { appealDeadlineFor, findNoticeRow } from '../moderation/notice-projection.js';
import { parseInput, uuidInputSchema } from '../posts/validation.js';

const DAY_MS = 24 * 60 * 60_000;

export interface ListAppealsResult {
  appeals: Appeal[];
  nextCursor: string;
  hasMore: boolean;
}

/**
 * The application service behind `patches.v1.AppealService` (spec §201.3). Admin-side
 * resolution (`UPHELD`/`OVERTURNED`/`MODIFIED`) is CLI-only (`patches-admin appeal
 * list|inspect|resolve`, `apps/admin/src/commands/appeal.ts`) — there is deliberately no gRPC
 * resolve RPC here, mirroring `report list|inspect|resolve` (§65).
 */
@Injectable()
export class AppealService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
    private readonly dbRateLimit: DbRateLimitStore,
  ) {}

  /**
   * `moderationNoticeId` is the `admin_audit_log.id` the notice projects from (`Appeal.entity.
   * ts`'s doc comment). Rejects with `MODERATION_NOTICE_NOT_FOUND` uniformly for "no such
   * row", "that row isn't notice-worthy", and "that row concerns someone else" — the same
   * no-oracle rule `POST_NOT_FOUND` already applies (spec §201.3: only the acted-upon actor
   * may appeal, and reports are not public, so leaking "that id exists but isn't yours" would
   * itself be a disclosure).
   */
  async createAppeal(
    actorId: string,
    moderationNoticeIdRaw: string,
    statementRaw: string,
  ): Promise<Appeal> {
    const moderationNoticeId = parseInput(uuidInputSchema, moderationNoticeIdRaw);
    const statement = normalizeStatement(statementRaw);
    await enforceWindowRateLimit(
      this.dbRateLimit,
      'appeal_file',
      actorId,
      RATE_LIMITS.appealFiledPerDay,
      DAY_MS,
    );

    return this.dataSource.transaction(async (manager) => {
      const notice = await findNoticeRow(manager, actorId, moderationNoticeId);
      if (notice === null) {
        throw new AppError('MODERATION_NOTICE_NOT_FOUND', 'That moderation notice does not exist.');
      }
      const deadline = appealDeadlineFor(notice, this.config.appealWindowDays);
      if (Date.now() > deadline.getTime()) {
        throw new AppError('APPEAL_WINDOW_CLOSED', 'The appeal window for that notice has closed.');
      }

      const appeals = manager.getRepository(Appeal);
      try {
        return await appeals.save(
          appeals.create({
            actorId,
            adminAuditLogId: moderationNoticeId,
            statement,
            status: 'OPEN',
          }),
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError('APPEAL_ALREADY_EXISTS', 'You have already appealed that notice.');
        }
        throw error;
      }
    });
  }

  /** Visible only to the appellant (spec §201.3) — moderators use `patches-admin appeal
   * inspect` instead, which is not scoped to `actorId`. */
  async getAppeal(actorId: string, idRaw: string): Promise<Appeal> {
    const id = parseInput(uuidInputSchema, idRaw);
    const appeal = await this.dataSource.getRepository(Appeal).findOne({ where: { id, actorId } });
    if (appeal === null) throw new AppError('APPEAL_NOT_FOUND', 'That appeal does not exist.');
    return appeal;
  }

  /** The caller's own appeals, most-recent first. */
  async listMyAppeals(
    actorId: string,
    cursorRaw: string,
    limit: number,
  ): Promise<ListAppealsResult> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(Appeal)
      .createQueryBuilder('appeal')
      .where('appeal.actorId = :actorId', { actorId })
      .orderBy('appeal.createdAt', 'DESC')
      .addOrderBy('appeal.id', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(appeal.createdAt, appeal.id) < (:cursorCreatedAt, :cursorId)', {
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
    return { appeals: page, nextCursor, hasMore };
  }
}

function normalizeStatement(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw AppError.validation('statement must not be empty.');
  if (trimmed.length > MAX_APPEAL_STATEMENT_CHARS) {
    throw AppError.validation(
      `statement must be at most ${String(MAX_APPEAL_STATEMENT_CHARS)} characters`,
    );
  }
  return trimmed;
}

/** PostgreSQL's `unique_violation` SQLSTATE, surfaced by `pg` as a plain `{ code: string }` —
 * same helper every other service in this codebase uses for its own idempotency races. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
