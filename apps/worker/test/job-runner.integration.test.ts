import { createDataSource, OutboxJob } from '@patches/database';
import type { StorageClient } from '@patches/media';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type AppConfigService } from '../src/config/app-config.service.js';
import { ConsoleEmailProvider } from '../src/email/console-email-provider.js';
import { CleanExpiredTokensHandler } from '../src/jobs/handlers/clean-expired-tokens.handler.js';
import { CleanExpiredUploadsHandler } from '../src/jobs/handlers/clean-expired-uploads.handler.js';
import { ExportAccountHandler } from '../src/jobs/handlers/export-account.handler.js';
import { FederationDeliverHandler } from '../src/jobs/handlers/federation-deliver.handler.js';
import { ProcessMediaHandler } from '../src/jobs/handlers/process-media.handler.js';
import { PurgeAccountHandler } from '../src/jobs/handlers/purge-account.handler.js';
import { RotateE2eeFrankingKeyHandler } from '../src/jobs/handlers/rotate-e2ee-franking-key.handler.js';
import { SendPasswordResetEmailHandler } from '../src/jobs/handlers/send-password-reset-email.handler.js';
import { SendVerificationEmailHandler } from '../src/jobs/handlers/send-verification-email.handler.js';
import { JobDispatcher } from '../src/jobs/job-dispatcher.js';
import { JobRunner } from '../src/jobs/job-runner.js';
import { waitFor } from './support/wait-for.js';

/** Neither `PROCESS_MEDIA` nor `CLEAN_EXPIRED_UPLOADS` is enqueued by this file's tests
 * (see `media-processing.integration.test.ts` for those) — this stub only exists so
 * `JobDispatcher`'s multi-handler constructor is satisfiable without a real MinIO. */
function unusedStorage(): StorageClient {
  const fail = (): never => {
    throw new Error('unusedStorage: not expected to be called by this test file');
  };
  return {
    presignPut: fail,
    presignGet: fail,
    head: fail,
    getObject: fail,
    putObject: fail,
    deleteObject: fail,
  };
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.warn('[apps/worker] Skipping JobRunner integration tests: TEST_DATABASE_URL is not set.');
}

describe.skipIf(!testDatabaseUrl)('JobRunner (integration, real Postgres)', () => {
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

  function fakeConfig(overrides: Partial<AppConfigService>): AppConfigService {
    return {
      workerId: 'test-worker',
      concurrency: 5,
      pollMs: 20,
      idleBackoffMaxMs: 40,
      mediaMaxBytes: 10 * 1024 * 1024,
      mediaMaxPixels: 20_000_000,
      mediaPendingUploadExpiryMinutes: 60,
      publicOrigin: 'http://localhost:3000',
      isProduction: false,
      // Long enough that the stale-lease sweep (B-013) never fires spuriously mid-test
      // against jobs these tests themselves just claimed; the sweep's own behavior is
      // exercised separately below with a short-lived override.
      leaseTtlMs: 10 * 60_000,
      leaseSweepIntervalMs: 60_000,
      ...overrides,
    } as AppConfigService;
  }

  function buildRunner(
    overrides: Partial<AppConfigService> = {},
    emailProvider: ConsoleEmailProvider = new ConsoleEmailProvider(),
  ): { runner: JobRunner; emailProvider: ConsoleEmailProvider } {
    const config = fakeConfig(overrides);
    const storage = unusedStorage();
    const dispatcher = new JobDispatcher(
      new SendVerificationEmailHandler(emailProvider),
      new SendPasswordResetEmailHandler(emailProvider),
      new CleanExpiredTokensHandler(dataSource),
      new ProcessMediaHandler(dataSource, storage, config),
      new CleanExpiredUploadsHandler(dataSource, storage, config),
      new FederationDeliverHandler(dataSource, config),
      new ExportAccountHandler(dataSource, storage),
      new PurgeAccountHandler(dataSource, storage),
      new RotateE2eeFrankingKeyHandler(dataSource),
    );
    const runner = new JobRunner(dataSource, dispatcher, config);
    return { runner, emailProvider };
  }

  async function enqueue(
    type: string,
    payload: Record<string, unknown>,
    overrides: Partial<OutboxJob> = {},
  ): Promise<OutboxJob> {
    const repository = dataSource.getRepository(OutboxJob);
    return repository.save(repository.create({ type, payload, ...overrides }));
  }

  it('processes a SEND_VERIFICATION_EMAIL job end-to-end via the console provider', async () => {
    const { runner, emailProvider } = buildRunner();
    const job = await enqueue('SEND_VERIFICATION_EMAIL', {
      userId: 'u1',
      email: 'user@example.com',
      code: '123456',
    });

    const runPromise = runner.run();
    await waitFor(async () => {
      const row = await dataSource.getRepository(OutboxJob).findOneBy({ id: job.id });
      return row?.status === 'COMPLETED';
    });
    runner.requestStop();
    await runPromise;

    expect(emailProvider.sent).toHaveLength(1);
    expect(emailProvider.sent[0]?.to).toBe('user@example.com');
    expect(emailProvider.sent[0]?.text).toContain('123456');

    const row = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: job.id });
    expect(row.status).toBe('COMPLETED');
    expect(row.completedAt).not.toBeNull();
  });

  it('a job whose handler throws is retried with backoff, then dead-lettered', async () => {
    const { runner } = buildRunner();
    // Missing `email`/`code` fails the handler's zod parse.
    const job = await enqueue('SEND_VERIFICATION_EMAIL', { userId: 'u1' }, { maxAttempts: 2 });

    const firstRun = runner.run();
    await waitFor(async () => {
      const row = await dataSource.getRepository(OutboxJob).findOneBy({ id: job.id });
      return row?.status === 'PENDING' && row.attempts === 1;
    });
    runner.requestStop();
    await firstRun;

    const rescheduled = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: job.id });
    expect(rescheduled.lastError).toBeTruthy();
    expect(rescheduled.availableAt.getTime()).toBeGreaterThan(Date.now());

    // Bypass the real backoff wait: make the job claimable again immediately, same technique
    // as packages/database/test/outbox.integration.test.ts.
    await dataSource
      .getRepository(OutboxJob)
      .update({ id: job.id }, { availableAt: new Date(Date.now() - 1000) });

    const { runner: runner2 } = buildRunner();
    const secondRun = runner2.run();
    await waitFor(async () => {
      const row = await dataSource.getRepository(OutboxJob).findOneBy({ id: job.id });
      return row?.status === 'DEAD';
    });
    runner2.requestStop();
    await secondRun;

    const dead = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: job.id });
    expect(dead.status).toBe('DEAD');
    expect(dead.attempts).toBe(2);
  });

  it('two concurrent runners never double-process the same jobs', async () => {
    const providerA = new ConsoleEmailProvider();
    const providerB = new ConsoleEmailProvider();
    const { runner: runnerA } = buildRunner({ workerId: 'worker-a' }, providerA);
    const { runner: runnerB } = buildRunner({ workerId: 'worker-b' }, providerB);

    const jobs = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        enqueue('SEND_VERIFICATION_EMAIL', {
          userId: `u${String(index)}`,
          email: `u${String(index)}@example.com`,
          code: '000000',
        }),
      ),
    );

    const runA = runnerA.run();
    const runB = runnerB.run();

    await waitFor(async () => {
      const rows = await dataSource.getRepository(OutboxJob).find();
      return rows.length === jobs.length && rows.every((row) => row.status === 'COMPLETED');
    });

    runnerA.requestStop();
    runnerB.requestStop();
    await Promise.all([runA, runB]);

    // No double-processing: every job was sent by exactly one of the two providers, so the
    // totals must add up to exactly the number enqueued, never more.
    expect(providerA.sent.length + providerB.sent.length).toBe(jobs.length);

    const rows = await dataSource.getRepository(OutboxJob).find();
    expect(rows.every((row) => row.status === 'COMPLETED')).toBe(true);
  });

  it('reclaims a job abandoned PROCESSING by a crashed worker (B-013)', async () => {
    // Simulates a worker that claimed the job, then died mid-handler (killed -9, OOM, host
    // failure) without ever reaching markOutboxJobSucceeded/Failed: `locked_at` stops
    // advancing and the row is left `PROCESSING` forever unless something notices.
    const stale = await enqueue(
      'SEND_VERIFICATION_EMAIL',
      { userId: 'u1', email: 'user@example.com', code: '123456' },
      {
        status: 'PROCESSING',
        lockedAt: new Date(Date.now() - 60_000),
        lockedBy: 'dead-worker',
        attempts: 1,
      },
    );

    // A short TTL/interval so the sweep fires well within the test's timeout without
    // waiting on the real WORKER_LEASE_TTL_MS default (10 minutes).
    const { runner, emailProvider } = buildRunner({ leaseTtlMs: 100, leaseSweepIntervalMs: 0 });

    const runPromise = runner.run();
    await waitFor(async () => {
      const row = await dataSource.getRepository(OutboxJob).findOneBy({ id: stale.id });
      return row?.status === 'COMPLETED';
    });
    runner.requestStop();
    await runPromise;

    expect(emailProvider.sent).toHaveLength(1);
    const row = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: stale.id });
    expect(row.status).toBe('COMPLETED');
    // Reclaim isn't a failed attempt: claimOutboxJobs increments attempts again on reclaim
    // (1 -> 2), same as any other claim, but the sweep itself never touches it.
    expect(row.attempts).toBe(2);
  });

  it('leaves a PROCESSING job alone while its lease is still fresh', async () => {
    const fresh = await enqueue(
      'SEND_VERIFICATION_EMAIL',
      { userId: 'u1', email: 'user@example.com', code: '123456' },
      { status: 'PROCESSING', lockedAt: new Date(), lockedBy: 'still-alive-worker' },
    );

    const { runner } = buildRunner({ leaseTtlMs: 10 * 60_000, leaseSweepIntervalMs: 0 });

    const runPromise = runner.run();
    // Give the sweep a few loop passes to (not) act, then stop and assert nothing changed.
    await new Promise((resolve) => setTimeout(resolve, 100));
    runner.requestStop();
    await runPromise;

    const row = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: fresh.id });
    expect(row.status).toBe('PROCESSING');
    expect(row.lockedBy).toBe('still-alive-worker');
  });
});
