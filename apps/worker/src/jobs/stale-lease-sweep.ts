import { OutboxJob } from '@patches/database';
import { LessThan } from 'typeorm';
import type { EntityManager } from 'typeorm';

/**
 * Resets jobs stuck `PROCESSING` after a worker crash — as opposed to a graceful `SIGTERM`,
 * which never force-releases a job mid-handler by design (`docs/architecture/jobs.md` §8,
 * `main.ts`'s shutdown comment) — back to `PENDING` so another worker can reclaim them
 * (`INITIAL_VISION.md` §12–13, B-013 in tasks.md).
 *
 * A row is "stale" once `locked_at` is older than `leaseTtlMs`: a crashed worker (killed
 * `-9`, OOM, host failure) leaves no signal behind other than a `PROCESSING` row whose lock
 * simply stops advancing, so age of the lock is the only thing this can go on. `attempts`
 * (already incremented by `claimOutboxJobs` when the job was first claimed) is left as-is —
 * this is a reclaim, not a failure, so it doesn't count against `max_attempts`.
 *
 * Deliberately **not** exported from `@patches/database`/`packages/database/src/repositories
 * /outbox.ts` alongside `claimOutboxJobs`/`markOutboxJobFailed`: this worker package owns it
 * because the lease-staleness policy (what counts as "too old") is a worker operational
 * concern, not a queue primitive every consumer of the outbox needs.
 */
export interface SweepStaleLeasesOptions {
  /** Lease TTL in milliseconds — see `WORKER_LEASE_TTL_MS`. */
  leaseTtlMs: number;
  /** Injectable clock — tests pass a fixed instant instead of waiting on wall time. */
  now?: Date;
}

/** Returns the number of jobs reset from `PROCESSING` back to `PENDING`. */
export async function sweepStaleLeases(
  manager: EntityManager,
  options: SweepStaleLeasesOptions,
): Promise<number> {
  const { leaseTtlMs, now = new Date() } = options;
  const staleBefore = new Date(now.getTime() - leaseTtlMs);

  const result = await manager.getRepository(OutboxJob).update(
    { status: 'PROCESSING', lockedAt: LessThan(staleBefore) },
    {
      status: 'PENDING',
      lockedAt: null,
      lockedBy: null,
      lastError: 'Reclaimed by stale-lease sweep: worker holding the lock stopped responding.',
    },
  );
  return result.affected ?? 0;
}
