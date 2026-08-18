import { createDataSource, OutboxJob } from '@patches/database';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type AppConfigService } from '../src/config/app-config.service.js';
import { ConsoleEmailProvider } from '../src/email/console-email-provider.js';
import { CleanExpiredTokensHandler } from '../src/jobs/handlers/clean-expired-tokens.handler.js';
import { SendPasswordResetEmailHandler } from '../src/jobs/handlers/send-password-reset-email.handler.js';
import { SendVerificationEmailHandler } from '../src/jobs/handlers/send-verification-email.handler.js';
import { JobDispatcher } from '../src/jobs/job-dispatcher.js';
import { JobRunner } from '../src/jobs/job-runner.js';
import { waitFor } from './support/wait-for.js';

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
      ...overrides,
    } as AppConfigService;
  }

  function buildRunner(
    overrides: Partial<AppConfigService> = {},
    emailProvider: ConsoleEmailProvider = new ConsoleEmailProvider(),
  ): { runner: JobRunner; emailProvider: ConsoleEmailProvider } {
    const dispatcher = new JobDispatcher(
      new SendVerificationEmailHandler(emailProvider),
      new SendPasswordResetEmailHandler(emailProvider),
      new CleanExpiredTokensHandler(dataSource),
    );
    const runner = new JobRunner(dataSource, dispatcher, fakeConfig(overrides));
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
});
