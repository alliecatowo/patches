import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { OutboxJob } from '../entities/outbox-job.entity.js';

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
  const { workerId, limit = 10, now = new Date() } = options;

  const candidates = await manager
    .createQueryBuilder(OutboxJob, 'job')
    .where('job.status = :status', { status: 'PENDING' })
    .andWhere('job.availableAt <= :now', { now })
    .orderBy('job.id', 'ASC')
    // `limit`, not `take`: `take` wraps the query in a DISTINCT/subquery form that the row
    // lock cannot be applied to. There are no joins here, so the two are otherwise identical.
    .limit(limit)
    .setLock('pessimistic_write')
    .setOnLocked('skip_locked')
    .getMany();

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
  now: Date = new Date(),
): Promise<void> {
  await manager.getRepository(OutboxJob).update(
    { id: jobId },
    {
      status: 'COMPLETED',
      completedAt: now,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  );
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
    error: string;
    now?: Date;
    backoff?: OutboxBackoffOptions;
    random?: () => number;
  },
): Promise<'PENDING' | 'DEAD' | null> {
  const {
    error,
    now = new Date(),
    backoff = DEFAULT_OUTBOX_BACKOFF,
    random = Math.random,
  } = options;

  const repository = manager.getRepository(OutboxJob);
  const job = await repository.findOne({ where: { id: jobId } });
  if (!job) return null;

  // `attempts` was already incremented when the job was claimed, so it counts this attempt.
  const exhausted = job.attempts >= job.maxAttempts;
  if (exhausted) {
    await repository.update(
      { id: jobId },
      { status: 'DEAD', lastError: error, lockedAt: null, lockedBy: null },
    );
    return 'DEAD';
  }

  const delayMs = outboxBackoffDelayMs(job.attempts, backoff, random);
  await repository.update(
    { id: jobId },
    {
      status: 'PENDING',
      lastError: error,
      availableAt: new Date(now.getTime() + delayMs),
      lockedAt: null,
      lockedBy: null,
    },
  );
  return 'PENDING';
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
