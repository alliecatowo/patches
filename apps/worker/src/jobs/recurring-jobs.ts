import { enqueueOutboxJobIfAbsent, OutboxJob } from '@patches/database';
import type { EntityManager } from 'typeorm';

/**
 * Recurring maintenance jobs (audit S-H3). Prod runs scale-to-zero and is woken once a day by
 * `.github/workflows/daily-wake.yml`, so a wall-clock window inside the worker loop (the old
 * "enqueue between 00:00 and 03:00 UTC" trick) can never fire. Instead every wake/boot
 * "ensures" today's occurrence of each job exists, due immediately, behind an idempotency key
 * of `<TYPE>:<UTC date>` — any number of boots or concurrent workers insert it at most once.
 */
const DAILY_JOB_TYPES = [
  'CLEAN_EXPIRED_TOKENS',
  'CLEAN_EXPIRED_UPLOADS',
  'CLEAN_EXPIRED_NOTIFICATIONS',
] as const;

export interface EnsureRecurringJobsOptions {
  /** Seed the self-perpetuating E2EE retention chain when none is live (ADR 0031 §4). */
  e2eeRetention: boolean;
}

/** `YYYY-MM-DD` in UTC. */
export function utcDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Start of the UTC day containing `now`. */
export function utcDayStart(now: Date): Date {
  return new Date(`${utcDateKey(now)}T00:00:00.000Z`);
}

/** Returns the job types newly enqueued by this call. */
export async function ensureRecurringJobs(
  manager: EntityManager,
  now: Date,
  options: EnsureRecurringJobsOptions,
): Promise<string[]> {
  const enqueued: string[] = [];
  const day = utcDateKey(now);

  for (const type of DAILY_JOB_TYPES) {
    const inserted = await enqueueOutboxJobIfAbsent(manager, {
      type,
      payload: {},
      availableAt: now,
      idempotencyKey: `${type}:${day}`,
    });
    if (inserted) enqueued.push(type);
  }

  if (options.e2eeRetention && (await seedE2eeRetentionSweep(manager, now))) {
    enqueued.push('E2EE_RETENTION_SWEEP');
  }
  return enqueued;
}

/**
 * The sweep reschedules its own successor (`e2ee-retention-sweep.handler.ts`), so seeding
 * every day would multiply chains. Seed only when no PENDING/PROCESSING sweep exists. The
 * bucket is the start of the UTC day, so each successor lands on a midnight bucket and is due
 * at the next daily wake rather than drifting past the wake window.
 */
async function seedE2eeRetentionSweep(manager: EntityManager, now: Date): Promise<boolean> {
  const live = await manager
    .getRepository(OutboxJob)
    .createQueryBuilder('job')
    .where('job.type = :type', { type: 'E2EE_RETENTION_SWEEP' })
    .andWhere('job.status IN (:...statuses)', { statuses: ['PENDING', 'PROCESSING'] })
    .getCount();
  if (live > 0) return false;

  const bucket = utcDayStart(now);
  return enqueueOutboxJobIfAbsent(manager, {
    type: 'E2EE_RETENTION_SWEEP',
    payload: { scheduledFor: bucket.toISOString() },
    availableAt: now,
    idempotencyKey: `e2ee-retention-sweep:seed:${utcDateKey(now)}`,
  });
}
