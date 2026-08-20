import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../src/data-source.js';
import { OutboxJob } from '../src/entities/outbox-job.entity.js';
import {
  claimOutboxJobs,
  countPendingOutboxJobs,
  markOutboxJobFailed,
  markOutboxJobSucceeded,
} from '../src/repositories/outbox.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.warn(
    '[packages/database] Skipping outbox integration tests: TEST_DATABASE_URL is not set.',
  );
}

describe.skipIf(!testDatabaseUrl)('outbox claim/complete/fail (integration, real Postgres)', () => {
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
    // These tests need committed rows (two concurrent transactions have to see each other),
    // so per-test isolation is truncate, not transaction-rollback.
    await dataSource.query('TRUNCATE TABLE "outbox_jobs" RESTART IDENTITY CASCADE');
  });

  async function enqueue(overrides: Partial<OutboxJob> = {}): Promise<OutboxJob> {
    const repository = dataSource.getRepository(OutboxJob);
    return repository.save(
      repository.create({
        type: 'SEND_VERIFICATION_EMAIL',
        payload: { userId: 'test' },
        ...overrides,
      }),
    );
  }

  it('two concurrent claimers each get a different job (FOR UPDATE SKIP LOCKED)', async () => {
    await enqueue();
    await enqueue();

    // Deliberately interleaved by hand rather than Promise.all: worker A holds its row lock
    // for the whole of B's claim, so without SKIP LOCKED this test would block until the
    // statement timeout instead of returning a second job.
    const runnerA = dataSource.createQueryRunner();
    const runnerB = dataSource.createQueryRunner();
    try {
      await runnerA.connect();
      await runnerB.connect();
      await runnerA.startTransaction();
      await runnerB.startTransaction();

      const claimedA = await claimOutboxJobs(runnerA.manager, { workerId: 'worker-a', limit: 1 });
      const claimedB = await claimOutboxJobs(runnerB.manager, { workerId: 'worker-b', limit: 1 });

      expect(claimedA).toHaveLength(1);
      expect(claimedB).toHaveLength(1);
      expect(claimedA[0]!.id).not.toBe(claimedB[0]!.id);
      expect(claimedA[0]!.status).toBe('PROCESSING');
      expect(claimedA[0]!.attempts).toBe(1);
      expect(claimedA[0]!.lockedBy).toBe('worker-a');

      await runnerA.commitTransaction();
      await runnerB.commitTransaction();
    } finally {
      await runnerA.release();
      await runnerB.release();
    }

    const rows = await dataSource.getRepository(OutboxJob).find();
    expect(rows.map((row) => row.status)).toEqual(['PROCESSING', 'PROCESSING']);
    expect(rows.map((row) => row.lockedBy).sort()).toEqual(['worker-a', 'worker-b']);
  });

  it('a third claimer finds nothing while both jobs are held', async () => {
    await enqueue();

    const holder = dataSource.createQueryRunner();
    try {
      await holder.connect();
      await holder.startTransaction();
      expect(await claimOutboxJobs(holder.manager, { workerId: 'holder', limit: 10 })).toHaveLength(
        1,
      );

      const other = await dataSource.transaction((manager) =>
        claimOutboxJobs(manager, { workerId: 'other', limit: 10 }),
      );
      expect(other).toEqual([]);

      await holder.commitTransaction();
    } finally {
      await holder.release();
    }
  });

  it('never claims a job scheduled for the future or one already finished', async () => {
    await enqueue({ availableAt: new Date(Date.now() + 60_000) });
    await enqueue({ status: 'COMPLETED' });
    await enqueue({ status: 'DEAD' });

    const claimed = await dataSource.transaction((manager) =>
      claimOutboxJobs(manager, { workerId: 'worker', limit: 10 }),
    );
    expect(claimed).toEqual([]);
  });

  it('marks a job COMPLETED and clears its lock', async () => {
    const job = await enqueue();
    await dataSource.transaction(async (manager) => {
      const [claimed] = await claimOutboxJobs(manager, { workerId: 'worker' });
      await markOutboxJobSucceeded(manager, claimed!.id);
    });

    const stored = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: job.id });
    expect(stored.status).toBe('COMPLETED');
    expect(stored.completedAt).not.toBeNull();
    expect(stored.lockedBy).toBeNull();
  });

  it('reschedules a failed job with backoff, then dead-letters it once attempts run out', async () => {
    const job = await enqueue({ maxAttempts: 2 });

    const first = await dataSource.transaction(async (manager) => {
      const [claimed] = await claimOutboxJobs(manager, { workerId: 'worker' });
      return markOutboxJobFailed(manager, claimed!.id, { error: 'smtp unavailable' });
    });
    expect(first).toBe('PENDING');

    const rescheduled = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: job.id });
    expect(rescheduled.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(rescheduled.lastError).toBe('smtp unavailable');
    expect(rescheduled.lockedBy).toBeNull();

    // Second (final) attempt: make it due again, claim, fail.
    await dataSource
      .getRepository(OutboxJob)
      .update({ id: job.id }, { availableAt: new Date(Date.now() - 1_000) });
    const second = await dataSource.transaction(async (manager) => {
      const [claimed] = await claimOutboxJobs(manager, { workerId: 'worker' });
      return markOutboxJobFailed(manager, claimed!.id, { error: 'smtp unavailable' });
    });
    expect(second).toBe('DEAD');

    const dead = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: job.id });
    expect(dead.status).toBe('DEAD');
    // Dead jobs are retained for operator inspection/replay, never deleted (jobs.md §6).
    expect(dead.attempts).toBe(2);
  });

  // S-002 (`OutboxCircuitBreaker`, `docs/operations/abuse-protection.md`).
  it('excludeTypes skips a due job of that type while still claiming other due types', async () => {
    await enqueue({ type: 'SEND_VERIFICATION_EMAIL' });
    await enqueue({ type: 'CLEAN_EXPIRED_TOKENS' });

    const claimed = await dataSource.transaction((manager) =>
      claimOutboxJobs(manager, {
        workerId: 'worker',
        limit: 10,
        excludeTypes: ['SEND_VERIFICATION_EMAIL'],
      }),
    );

    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.type).toBe('CLEAN_EXPIRED_TOKENS');

    const stillPending = await dataSource
      .getRepository(OutboxJob)
      .findOneByOrFail({ type: 'SEND_VERIFICATION_EMAIL' });
    expect(stillPending.status).toBe('PENDING');
  });

  it('countPendingOutboxJobs counts only PENDING rows', async () => {
    await enqueue();
    await enqueue({ status: 'COMPLETED' });
    await enqueue({ status: 'DEAD' });

    expect(await countPendingOutboxJobs(dataSource.manager)).toBe(1);
  });
});
