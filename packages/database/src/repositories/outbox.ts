import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import { AuthCode } from '../entities/auth-code.entity.js';
import { OutboxJob } from '../entities/outbox-job.entity.js';
import { isAuthCodeEmailJobType } from '../jobs/auth-code-delivery.js';
import { AUTH_CODE_DELIVERY_TOMBSTONE, authCodeDeliveryEnvelopeSchema } from '../jobs/payloads.js';

/**
 * Claim/complete/fail helpers for the durable job queue (`INITIAL_VISION.md` §12–13,
 * `docs/architecture/jobs.md`).
 *
 * Deliberately **pure functions over an `EntityManager`** rather than a Nest provider or a
 * custom repository class: the worker, the server (which enqueues), and the integration
 * tests all need exactly this logic, and `packages/database` must not import anything from
 * NestJS or gRPC (spec §128–129). Callers pass whichever manager they already have — inside
 * `dataSource.transaction()`, that is the transaction-scoped manager (§16.3).
 */

/** Backoff parameters (`docs/architecture/jobs.md` §5). */
export interface OutboxBackoffOptions {
  baseDelayMs: number;
  maxDelayMs: number;
  /** Extra random delay in `[0, jitterMs)`, so a thundering herd of retries spreads out. */
  jitterMs: number;
}

export const DEFAULT_OUTBOX_BACKOFF: OutboxBackoffOptions = {
  baseDelayMs: 5_000,
  maxDelayMs: 15 * 60_000,
  jitterMs: 5_000,
};

export interface ClaimOutboxJobsOptions {
  /** Worker instance identifier, recorded in `locked_by` for operator visibility. */
  workerId: string;
  /** Maximum rows to claim in this pass. */
  limit?: number;
  /** Injectable clock — tests pass a fixed instant instead of waiting on wall time. */
  now?: Date;
  /** Injectable randomness for jitter; defaults to `Math.random`. */
  random?: () => number;
  /**
   * S-002 (`OutboxCircuitBreaker`, `apps/worker/src/jobs/outbox-circuit-breaker.ts`,
   * `docs/operations/abuse-protection.md`): job types to skip claiming this pass — a type whose
   * circuit is open (repeatedly failing, usually a downstream outage like federation delivery
   * to an unreachable peer) stays `PENDING` and its backlog is allowed to grow, rather than the
   * worker burning its whole `concurrency` budget retrying a type that keeps failing while
   * healthy types starve behind it in the `ORDER BY id ASC` queue.
   */
  excludeTypes?: readonly string[];
}

/**
 * Claims up to `limit` due jobs and marks them `PROCESSING` in one transaction.
 *
 * `FOR UPDATE SKIP LOCKED` (via `setLock('pessimistic_write').setOnLocked('skip_locked')`,
 * the 1.x replacement for the removed `pessimistic_partial_write` mode — see
 * `docs/research/typeorm-postgres.md` §5) is what makes concurrent workers safe: two workers
 * racing this query never see the same row, and neither blocks on the other's lock.
 *
 * **`manager` MUST be transactional** — TypeORM throws
 * `PessimisticLockTransactionRequiredError` otherwise, and the row locks would be released
 * before the claim was recorded anyway. The locks are held until the caller's transaction
 * commits, so the `UPDATE` below cannot race a second claimer.
 */
export async function claimOutboxJobs(
  manager: EntityManager,
  options: ClaimOutboxJobsOptions,
): Promise<OutboxJob[]> {
  const { workerId, limit = 10, now = new Date(), excludeTypes = [] } = options;

  const qb = manager
    .createQueryBuilder(OutboxJob, 'job')
    .where('job.status = :status', { status: 'PENDING' })
    .andWhere('job.availableAt <= :now', { now })
    .orderBy('job.id', 'ASC')
    // `limit`, not `take`: `take` wraps the query in a DISTINCT/subquery form that the row
    // lock cannot be applied to. There are no joins here, so the two are otherwise identical.
    .limit(limit)
    .setLock('pessimistic_write')
    .setOnLocked('skip_locked');

  if (excludeTypes.length > 0) {
    qb.andWhere('job.type NOT IN (:...excludeTypes)', { excludeTypes });
  }

  const candidates = await qb.getMany();

  if (candidates.length === 0) return [];

  const ids = candidates.map((job) => job.id);
  await manager.getRepository(OutboxJob).update(
    { id: In(ids) },
    {
      status: 'PROCESSING',
      lockedAt: now,
      lockedBy: workerId,
      attempts: () => '"attempts" + 1',
    },
  );

  // Mirror the update onto the already-loaded rows instead of re-selecting them: the
  // caller gets the post-claim state without a second round trip.
  return candidates.map((job) =>
    Object.assign(job, {
      status: 'PROCESSING' as const,
      lockedAt: now,
      lockedBy: workerId,
      attempts: job.attempts + 1,
    }),
  );
}

/** Marks a claimed job `COMPLETED` and releases its lock fields. */
export async function markOutboxJobSucceeded(
  manager: EntityManager,
  jobId: string,
  claim: { workerId: string; lockedAt: Date },
  now: Date = new Date(),
): Promise<boolean> {
  const result = await manager
    .getRepository(OutboxJob)
    .createQueryBuilder()
    .update(OutboxJob)
    .set({
      status: 'COMPLETED',
      completedAt: now,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      // Enforce auth-envelope scrubbing here rather than relying on every caller to remember
      // a special option. The status and tombstone still land in this one atomic UPDATE.
      payload: () =>
        `CASE WHEN "type" IN ('SEND_VERIFICATION_EMAIL', 'SEND_PASSWORD_RESET_EMAIL') ` +
        `THEN '{"v":1,"redacted":true}'::jsonb ELSE "payload" END`,
    })
    .where('id = :id', { id: jobId })
    .andWhere('status = :status', { status: 'PROCESSING' })
    .andWhere('locked_by = :workerId', { workerId: claim.workerId })
    .andWhere('locked_at = :lockedAt', { lockedAt: claim.lockedAt })
    .execute();
  return (result.affected ?? 0) === 1;
}

/**
 * Records a failed attempt: either reschedules the job with exponential backoff, or moves it
 * to the `DEAD` letter state once `attempts >= max_attempts` (`jobs.md` §5–6). Dead jobs are
 * retained for operator inspection/replay, never deleted.
 *
 * Reads the row first so the decision uses the committed `attempts`/`max_attempts` rather
 * than whatever the caller's in-memory copy says. Returns the resulting status, or `null` if
 * the job no longer exists.
 */
export async function markOutboxJobFailed(
  manager: EntityManager,
  jobId: string,
  options: {
    claim: { workerId: string; lockedAt: Date };
    error: string;
    now?: Date;
    backoff?: OutboxBackoffOptions;
    random?: () => number;
  },
): Promise<'PENDING' | 'DEAD' | null> {
  const {
    claim,
    error,
    now = new Date(),
    backoff = DEFAULT_OUTBOX_BACKOFF,
    random = Math.random,
  } = options;

  const repository = manager.getRepository(OutboxJob);
  const job = await repository.findOne({
    where: {
      id: jobId,
      status: 'PROCESSING',
      lockedBy: claim.workerId,
      lockedAt: claim.lockedAt,
    },
  });
  if (!job) return null;
  const safeError = isAuthCodeEmailJobType(job.type) ? 'AUTH_CODE_DELIVERY_FAILED' : error;

  // `attempts` was already incremented when the job was claimed, so it counts this attempt.
  const exhausted = job.attempts >= job.maxAttempts;
  if (exhausted) {
    const result = await repository
      .createQueryBuilder()
      .update(OutboxJob)
      .set({
        status: 'DEAD',
        lastError: safeError,
        lockedAt: null,
        lockedBy: null,
        ...(isAuthCodeEmailJobType(job.type) ? { payload: AUTH_CODE_DELIVERY_TOMBSTONE } : {}),
      })
      .where('id = :id', { id: jobId })
      .andWhere('status = :status', { status: 'PROCESSING' })
      .andWhere('locked_by = :workerId', { workerId: claim.workerId })
      .andWhere('locked_at = :lockedAt', { lockedAt: claim.lockedAt })
      .execute();
    if ((result.affected ?? 0) !== 1) return null;
    if (isAuthCodeEmailJobType(job.type)) {
      const envelope = authCodeDeliveryEnvelopeSchema.safeParse(job.payload);
      const authCodeId = envelope.success
        ? envelope.data.authCodeId
        : extractAuthCodeId(job.payload);
      if (authCodeId !== null) {
        await manager.getRepository(AuthCode).delete({ id: authCodeId });
      }
    }
    return 'DEAD';
  }

  const delayMs = outboxBackoffDelayMs(job.attempts, backoff, random);
  const result = await repository
    .createQueryBuilder()
    .update(OutboxJob)
    .set({
      status: 'PENDING',
      lastError: safeError,
      availableAt: new Date(now.getTime() + delayMs),
      lockedAt: null,
      lockedBy: null,
    })
    .where('id = :id', { id: jobId })
    .andWhere('status = :status', { status: 'PROCESSING' })
    .andWhere('locked_by = :workerId', { workerId: claim.workerId })
    .andWhere('locked_at = :lockedAt', { lockedAt: claim.lockedAt })
    .execute();
  return (result.affected ?? 0) === 1 ? 'PENDING' : null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Best-effort identifier recovery for terminal malformed envelopes; never returns ciphertext. */
function extractAuthCodeId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).authCodeId;
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

/**
 * B-014: resets a `DEAD` job back to `PENDING` so the worker reclaims it on its next pass,
 * keeping `attempts` as-is — a replay is not a fresh job, so the existing `max_attempts`
 * ceiling still applies and a job that fails again after replay dead-letters again rather
 * than retrying forever. `available_at` is reset to `now` so the job is immediately
 * claimable instead of waiting out whatever backoff put it here.
 *
 * The `WHERE status = 'DEAD'` guard makes this a conditional update, not a
 * read-modify-write: two operators (or one fat-fingered double `replay`) racing the same job
 * id can only have one of them actually flip it, mirroring `consumeInvite`'s conditional
 * increment. Returns `false` (not an error) when the job was not `DEAD` — the caller decides
 * whether that's worth surfacing.
 */
export async function replayOutboxJob(
  manager: EntityManager,
  jobId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await manager
    .getRepository(OutboxJob)
    .createQueryBuilder()
    .update(OutboxJob)
    .set({ status: 'PENDING', availableAt: now, lockedAt: null, lockedBy: null })
    .where('id = :id', { id: jobId })
    .andWhere('status = :status', { status: 'DEAD' })
    .andWhere("type NOT IN ('SEND_VERIFICATION_EMAIL', 'SEND_PASSWORD_RESET_EMAIL')")
    .execute();
  return (result.affected ?? 0) === 1;
}

/** Row shape for {@link enqueueOutboxJobIfAbsent}. */
export interface OutboxJobInsert {
  type: string;
  payload: Record<string, unknown>;
  availableAt: Date;
  idempotencyKey: string;
}

/**
 * Inserts a job only when no row already holds its `idempotency_key`, via
 * `INSERT ... ON CONFLICT DO NOTHING` — the check is atomic in the database, not a
 * read-then-write race. Two workers crossing the same scheduling boundary at once (B-102's
 * daily cleanup is the motivating case) both succeed; exactly one inserts and the other gets
 * `false`. Returns whether this call created the row.
 */
export async function enqueueOutboxJobIfAbsent(
  manager: EntityManager,
  job: OutboxJobInsert,
): Promise<boolean> {
  const result = await manager
    .createQueryBuilder()
    .insert()
    .into(OutboxJob)
    .values({
      type: job.type,
      payload: job.payload,
      availableAt: job.availableAt,
      idempotencyKey: job.idempotencyKey,
      // `_QueryDeepPartialEntity` does not accept a plain object for the `payload` jsonb
      // column — same deep-partial quirk as `actor.service.ts`'s nameplate note.
    } as QueryDeepPartialEntity<OutboxJob>)
    // Plain `orIgnore()` emits `ON CONFLICT DO NOTHING`: the only unique constraints on
    // `outbox_jobs` are the primary key (absent here) and `idempotency_key`, so an ignored
    // insert always means "another worker already scheduled this job".
    .orIgnore()
    .execute();
  // Postgres appends RETURNING to the insert; a conflict-ignored row returns none.
  return (result.raw as unknown[]).length > 0;
}

/**
 * S-002 (`docs/operations/abuse-protection.md`): total `PENDING` row count, regardless of
 * `available_at` — used by `JobRunner`'s periodic backlog log, not the claim loop itself (that
 * stays a plain `SELECT`, no lock, so it never contends with a concurrent claim's `FOR UPDATE`).
 */
export async function countPendingOutboxJobs(manager: EntityManager): Promise<number> {
  return manager.getRepository(OutboxJob).count({ where: { status: 'PENDING' } });
}

/**
 * `min(baseDelay * 2^attempts, maxDelay) + random(0, jitter)` (`jobs.md` §5). Exported
 * separately so it can be unit-tested without a database.
 */
export function outboxBackoffDelayMs(
  attempts: number,
  backoff: OutboxBackoffOptions = DEFAULT_OUTBOX_BACKOFF,
  random: () => number = Math.random,
): number {
  const exponential = backoff.baseDelayMs * 2 ** Math.max(0, attempts);
  return Math.min(exponential, backoff.maxDelayMs) + Math.floor(random() * backoff.jitterMs);
}
