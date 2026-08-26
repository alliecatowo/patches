import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AccountDeletionRequest,
  AccountExport,
  ActorPrivacyPrefs,
  OutboxJob,
  type JobType,
} from '@patches/database';
import { ACCOUNT_DELETION_GRACE_PERIOD_DAYS_DEFAULT } from '@patches/domain';
import { type StorageClient } from '@patches/media';
import { DataSource, type EntityManager } from 'typeorm';

import { getRequestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { RateLimitService } from '../auth/rate-limit.service.js';
import { TokenService } from '../auth/token.service.js';
import { STORAGE_CLIENT } from '../media/storage-client.provider.js';
import type {
  AccountDeletionStatusView,
  AccountExportView,
  PrivacyPrefsView,
  UpdatePrivacyPrefsInput,
} from './privacy.dto.js';
import { noticeVersionInputSchema, parseInput } from './validation.js';

const EXPORT_JOB_TYPE: JobType = 'EXPORT_ACCOUNT';
const PURGE_JOB_TYPE: JobType = 'PURGE_ACCOUNT';

function defaultPrivacyPrefsView(): PrivacyPrefsView {
  return {
    discoverable: true,
    indexable: true,
    showInLocalFeed: true,
    locked: false,
    privacyNoticeVersion: null,
    privacyNoticeAcknowledgedAt: null,
  };
}

function toPrivacyPrefsView(row: ActorPrivacyPrefs): PrivacyPrefsView {
  return {
    discoverable: row.discoverable,
    indexable: row.indexable,
    showInLocalFeed: row.showInLocalFeed,
    locked: row.locked,
    privacyNoticeVersion: row.privacyNoticeVersion,
    privacyNoticeAcknowledgedAt: row.privacyNoticeAcknowledgedAt,
  };
}

/** Every RPC here reads/writes exactly one row, keyed by `actorId`, that may not exist yet
 * (an actor registered before this table existed, or — pre-P14-010 — before every registration
 * created one). `findOne` + `save`, not `upsert`, because a handful of callers need to apply a
 * partial change (a field-mask patch) on top of whatever the row already holds. */
async function loadOrCreatePrivacyPrefs(
  manager: EntityManager,
  actorId: string,
): Promise<ActorPrivacyPrefs> {
  const repository = manager.getRepository(ActorPrivacyPrefs);
  const existing = await repository.findOne({ where: { actorId } });
  if (existing !== null) return existing;
  return repository.save(repository.create({ actorId, ...defaultPrivacyPrefsView() }));
}

function toAccountExportView(row: AccountExport, downloadUrl: string | null): AccountExportView {
  return {
    id: row.id,
    status: row.status,
    requestedAt: row.requestedAt,
    readyAt: row.readyAt,
    downloadUrl,
    expiresAt: row.expiresAt,
  };
}

function toAccountDeletionStatusView(
  row: AccountDeletionRequest | null,
): AccountDeletionStatusView {
  if (row === null) {
    return { pending: false, requestedAt: null, purgeAfter: null, cancelledAt: null };
  }
  return {
    pending: row.cancelledAt === null && row.purgedAt === null,
    requestedAt: row.requestedAt,
    purgeAfter: row.purgeAfter,
    cancelledAt: row.cancelledAt,
  };
}

/**
 * The application service behind `patches.v1.PrivacyService` (spec §197). `ExportAccount`/
 * `RequestAccountDeletion` never do the actual work synchronously — both only ever write a
 * row and enqueue a durable outbox job (`docs/architecture/jobs.md` §3); `apps/worker`'s
 * `ExportAccountHandler`/`PurgeAccountHandler` do the rest.
 */
@Injectable()
export class PrivacyService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
    private readonly config: AppConfigService,
    private readonly rateLimit: RateLimitService,
    private readonly tokens: TokenService,
  ) {}

  acknowledgePrivacyNotice(actorId: string, noticeVersionRaw: number): Promise<PrivacyPrefsView> {
    const noticeVersion = parseInput(noticeVersionInputSchema, noticeVersionRaw);

    return this.dataSource.transaction(async (manager) => {
      const prefs = await loadOrCreatePrivacyPrefs(manager, actorId);
      prefs.privacyNoticeVersion = noticeVersion;
      prefs.privacyNoticeAcknowledgedAt = new Date();
      return toPrivacyPrefsView(await manager.getRepository(ActorPrivacyPrefs).save(prefs));
    });
  }

  async getPrivacyPrefs(actorId: string): Promise<PrivacyPrefsView> {
    const row = await this.dataSource
      .getRepository(ActorPrivacyPrefs)
      .findOne({ where: { actorId } });
    return row === null ? defaultPrivacyPrefsView() : toPrivacyPrefsView(row);
  }

  /** Partial update of the caller's own prefs, driven by `update_mask` — same pattern as
   * `ActorService.updateProfile` (spec: `privacy.proto`'s `UpdatePrivacyPrefsRequest` doc). A
   * field not named in the mask is left untouched even if set on the request. */
  updatePrivacyPrefs(input: UpdatePrivacyPrefsInput): Promise<PrivacyPrefsView> {
    const paths = new Set(input.updateMask);

    return this.dataSource.transaction(async (manager) => {
      const prefs = await loadOrCreatePrivacyPrefs(manager, input.actorId);
      if (paths.has('discoverable')) prefs.discoverable = input.discoverable;
      if (paths.has('indexable')) prefs.indexable = input.indexable;
      if (paths.has('show_in_local_feed')) prefs.showInLocalFeed = input.showInLocalFeed;
      // `locked` (spec §197.5) has no follow-request enforcement yet — see `privacy.module.ts`'s
      // class doc. The preference is still honestly stored so the follow-up that adds
      // enforcement has somewhere real to read it from.
      if (paths.has('locked')) prefs.locked = input.locked;
      return toPrivacyPrefsView(await manager.getRepository(ActorPrivacyPrefs).save(prefs));
    });
  }

  /** Enqueues a background export job (spec §30, §197.3) — never synchronous, never streams
   * the archive through this process. Idempotent in the sense that a caller who already has a
   * `PENDING` export gets that same row back instead of a second concurrent job. */
  async exportAccount(actorId: string): Promise<AccountExportView> {
    this.rateLimit.consumePeer('export_account', getRequestContext()?.peer);
    this.rateLimit.consume('export_account', actorId);
    await this.rateLimit.consumeDistributed('export_account', actorId);

    return this.dataSource.transaction(async (manager) => {
      const exports = manager.getRepository(AccountExport);
      const pending = await exports.findOne({ where: { actorId, status: 'PENDING' } });
      if (pending !== null) return toAccountExportView(pending, null);

      const saved = await exports.save(exports.create({ actorId, status: 'PENDING' }));

      await manager.getRepository(OutboxJob).save(
        manager.getRepository(OutboxJob).create({
          type: EXPORT_JOB_TYPE,
          payload: { exportId: saved.id, actorId },
          idempotencyKey: `export-account:${saved.id}`,
        }),
      );

      return toAccountExportView(saved, null);
    });
  }

  /** Most recent export for the caller, with a fresh presigned download URL if it's `READY`
   * (spec §29 — the URL itself is never persisted, only the private object key is). */
  async getExportStatus(actorId: string): Promise<AccountExportView | null> {
    const row = await this.dataSource
      .getRepository(AccountExport)
      .findOne({ where: { actorId }, order: { requestedAt: 'DESC' } });
    if (row === null) return null;
    if (row.status !== 'READY' || row.objectKey === null) return toAccountExportView(row, null);

    const { url } = await this.storage.presignGet(row.objectKey, {
      expiresInSeconds: this.config.mediaPresignGetTtlSeconds,
    });
    return toAccountExportView(row, url);
  }

  /**
   * Moves the account to "pending deletion" (spec §197.4): revokes every live session
   * immediately, and schedules the purge job for `purgeAfter` — the outbox's own
   * `available_at` delay *is* the grace-period timer, so no separate scheduler exists. Calling
   * this again while a deletion is already pending is a no-op that returns the existing
   * status (idempotent) rather than restarting the clock.
   */
  async requestAccountDeletion(
    actorId: string,
    userId: string,
  ): Promise<AccountDeletionStatusView> {
    this.rateLimit.consumePeer('account_deletion_request_or_cancel', getRequestContext()?.peer);
    this.rateLimit.consume('account_deletion_request_or_cancel', actorId);
    await this.rateLimit.consumeDistributed('account_deletion_request_or_cancel', actorId);

    return this.dataSource.transaction(async (manager) => {
      const requests = manager.getRepository(AccountDeletionRequest);
      const existing = await requests.findOne({ where: { actorId } });
      if (existing !== null && existing.cancelledAt === null && existing.purgedAt === null) {
        return toAccountDeletionStatusView(existing);
      }
      if (existing !== null && existing.purgedAt !== null) {
        throw AppError.validation('This account has already been deleted.');
      }

      const now = new Date();
      const purgeAfter = new Date(
        now.getTime() + ACCOUNT_DELETION_GRACE_PERIOD_DAYS_DEFAULT * 24 * 60 * 60 * 1000,
      );
      const saved = await requests.save(
        requests.create({
          actorId,
          requestedAt: now,
          purgeAfter,
          cancelledAt: null,
          purgedAt: null,
        }),
      );

      await manager.getRepository(OutboxJob).save(
        manager.getRepository(OutboxJob).create({
          type: PURGE_JOB_TYPE,
          payload: { actorId },
          availableAt: purgeAfter,
          // Scoped to this request cycle, not just the actor: a cancel-then-re-request must be
          // able to schedule a fresh job under a fresh key once the first one has already run
          // its course (`docs/architecture/jobs.md` §7 — see also `cancelAccountDeletion`,
          // which removes any still-`PENDING` job for the *previous* cycle outright).
          idempotencyKey: `purge-account:${actorId}:${now.toISOString()}`,
        }),
      );

      // Sessions are revoked immediately, not deferred to the purge job (spec §197.4: "sessions
      // are revoked" is listed alongside "disappears ... immediately", not "after the grace
      // period").
      await this.tokens.revokeAllForUser(manager, userId);

      return toAccountDeletionStatusView(saved);
    });
  }

  /** Restores the account intact — only while still within the grace period. Also removes any
   * still-`PENDING` purge job for this cycle so a worker that happens to claim it moments
   * later finds nothing to do, rather than relying solely on the handler's own re-check of
   * `cancelled_at` (belt and suspenders — both are correct on their own). */
  async cancelAccountDeletion(actorId: string): Promise<AccountDeletionStatusView> {
    this.rateLimit.consumePeer('account_deletion_request_or_cancel', getRequestContext()?.peer);
    this.rateLimit.consume('account_deletion_request_or_cancel', actorId);
    await this.rateLimit.consumeDistributed('account_deletion_request_or_cancel', actorId);

    return this.dataSource.transaction(async (manager) => {
      const requests = manager.getRepository(AccountDeletionRequest);
      const existing = await requests.findOne({ where: { actorId } });
      if (existing === null || existing.cancelledAt !== null || existing.purgedAt !== null) {
        throw AppError.validation('There is no pending account deletion to cancel.');
      }

      existing.cancelledAt = new Date();
      const saved = await requests.save(existing);

      await manager
        .getRepository(OutboxJob)
        .createQueryBuilder()
        .delete()
        .where('type = :type', { type: PURGE_JOB_TYPE })
        .andWhere('status = :status', { status: 'PENDING' })
        .andWhere(`payload->>'actorId' = :actorId`, { actorId })
        .execute();

      return toAccountDeletionStatusView(saved);
    });
  }

  async getDeletionStatus(actorId: string): Promise<AccountDeletionStatusView> {
    const row = await this.dataSource
      .getRepository(AccountDeletionRequest)
      .findOne({ where: { actorId } });
    return toAccountDeletionStatusView(row);
  }
}
