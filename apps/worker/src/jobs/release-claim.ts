import { OutboxJob } from '@patches/database';
import type { EntityManager } from 'typeorm';

/**
 * Releases a claimed job back to `PENDING` without counting it as a failed attempt.
 *
 * Used only when a job's `type` has no registered handler in this worker build
 * (`docs/architecture/jobs.md` §9: `PROCESS_MEDIA`/`CLEAN_EXPIRED_UPLOADS` have no handler
 * yet — media isn't implemented). Decrements `attempts` by one to undo the increment
 * `claimOutboxJobs` already applied, so a job type this worker simply can't run yet is never
 * exhausted into `DEAD`; it just waits, claimable again once `available_at` is reached, for a
 * future worker deploy that does register a handler for it.
 */
export async function releaseUnhandledJob(manager: EntityManager, jobId: string): Promise<void> {
  await manager.getRepository(OutboxJob).update(
    { id: jobId },
    {
      status: 'PENDING',
      lockedAt: null,
      lockedBy: null,
      attempts: () => '"attempts" - 1',
    },
  );
}
