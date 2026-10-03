import { createDataSource, OutboxJob } from '@patches/database';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ensureRecurringJobs } from '../src/jobs/recurring-jobs.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('ensureRecurringJobs (integration, real Postgres)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createDataSource({ url: testDatabaseUrl! });
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "outbox_jobs" RESTART IDENTITY CASCADE');
  });

  const typesOf = async (): Promise<string[]> =>
    (await dataSource.getRepository(OutboxJob).find()).map((job) => job.type).sort();

  it('enqueues every maintenance job, due now, on the first wake of the day', async () => {
    const wake = new Date('2026-10-04T04:43:20.000Z');
    const enqueued = await ensureRecurringJobs(dataSource.manager, wake, { e2eeRetention: true });

    expect(enqueued.sort()).toEqual([
      'CLEAN_EXPIRED_NOTIFICATIONS',
      'CLEAN_EXPIRED_TOKENS',
      'CLEAN_EXPIRED_UPLOADS',
      'E2EE_RETENTION_SWEEP',
    ]);
    const jobs = await dataSource.getRepository(OutboxJob).find();
    for (const job of jobs) expect(job.availableAt.getTime()).toBeLessThanOrEqual(wake.getTime());
    const sweep = jobs.find((job) => job.type === 'E2EE_RETENTION_SWEEP');
    expect(sweep?.payload).toEqual({ scheduledFor: '2026-10-04T00:00:00.000Z' });
  });

  it('is idempotent across repeated boots and concurrent workers on the same UTC day', async () => {
    const wake = new Date('2026-10-04T04:43:20.000Z');
    await Promise.all([
      ensureRecurringJobs(dataSource.manager, wake, { e2eeRetention: true }),
      ensureRecurringJobs(dataSource.manager, wake, { e2eeRetention: true }),
    ]);
    const again = await ensureRecurringJobs(
      dataSource.manager,
      new Date('2026-10-04T04:50:00.000Z'),
      { e2eeRetention: true },
    );
    expect(again).toEqual([]);
    expect(await typesOf()).toHaveLength(4);
  });

  it('schedules the daily jobs again the next day but never forks the E2EE chain', async () => {
    await ensureRecurringJobs(dataSource.manager, new Date('2026-10-04T04:43:00.000Z'), {
      e2eeRetention: true,
    });
    const next = await ensureRecurringJobs(
      dataSource.manager,
      new Date('2026-10-05T04:43:00.000Z'),
      { e2eeRetention: true },
    );
    expect(next.sort()).toEqual([
      'CLEAN_EXPIRED_NOTIFICATIONS',
      'CLEAN_EXPIRED_TOKENS',
      'CLEAN_EXPIRED_UPLOADS',
    ]);
    expect((await typesOf()).filter((type) => type === 'E2EE_RETENTION_SWEEP')).toHaveLength(1);
  });

  it('re-seeds the E2EE chain when it has died', async () => {
    await ensureRecurringJobs(dataSource.manager, new Date('2026-10-04T04:43:00.000Z'), {
      e2eeRetention: true,
    });
    await dataSource.query(
      `UPDATE outbox_jobs SET status = 'DEAD' WHERE type = 'E2EE_RETENTION_SWEEP'`,
    );
    const next = await ensureRecurringJobs(
      dataSource.manager,
      new Date('2026-10-05T04:43:00.000Z'),
      { e2eeRetention: true },
    );
    expect(next).toContain('E2EE_RETENTION_SWEEP');
  });

  it('does not seed the E2EE sweep when disabled', async () => {
    const enqueued = await ensureRecurringJobs(
      dataSource.manager,
      new Date('2026-10-04T04:43:00.000Z'),
      { e2eeRetention: false },
    );
    expect(enqueued).not.toContain('E2EE_RETENTION_SWEEP');
    expect(await typesOf()).toHaveLength(3);
  });
});
