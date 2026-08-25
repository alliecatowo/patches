import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import {
  AccountDeletionRequest,
  AuthCode,
  createDataSource,
  encryptAuthCodeDelivery,
  enqueueOutboxJobIfAbsent,
  OutboxJob,
} from '@patches/database';
import type { StorageClient } from '@patches/media';
import { createTestUser } from '@patches/testkit';
import { In } from 'typeorm';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AppConfigService } from '../src/config/app-config.service.js';
import { ConsoleEmailProvider } from '../src/email/console-email-provider.js';
import { AuthCodeEmailDeliveryService } from '../src/jobs/auth-code-email-delivery.service.js';
import { CleanExpiredNotificationsHandler } from '../src/jobs/handlers/clean-expired-notifications.handler.js';
import { CleanExpiredTokensHandler } from '../src/jobs/handlers/clean-expired-tokens.handler.js';
import { CleanExpiredUploadsHandler } from '../src/jobs/handlers/clean-expired-uploads.handler.js';
import { ExportAccountHandler } from '../src/jobs/handlers/export-account.handler.js';
import { FederationDeliverHandler } from '../src/jobs/handlers/federation-deliver.handler.js';
import { ProcessMediaHandler } from '../src/jobs/handlers/process-media.handler.js';
import { PurgeAccountHandler } from '../src/jobs/handlers/purge-account.handler.js';
import { RotateE2eeFrankingKeyHandler } from '../src/jobs/handlers/rotate-e2ee-franking-key.handler.js';
import { E2eeRetentionSweepHandler } from '../src/jobs/handlers/e2ee-retention-sweep.handler.js';
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
const AUTH_CODE_KEY_ID = 'test';
const AUTH_CODE_KEYS = { [AUTH_CODE_KEY_ID]: randomBytes(32).toString('base64') };

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
      authCodeDeliveryKeys: AUTH_CODE_KEYS,
      authCodeDeliveryActiveKeyId: AUTH_CODE_KEY_ID,
      ...overrides,
    } as AppConfigService;
  }

  function buildRunner(
    overrides: Partial<AppConfigService> = {},
    emailProvider: ConsoleEmailProvider = new ConsoleEmailProvider(),
  ): { runner: JobRunner; emailProvider: ConsoleEmailProvider } {
    const config = fakeConfig(overrides);
    const storage = unusedStorage();
    const authCodeDelivery = new AuthCodeEmailDeliveryService(dataSource, config, emailProvider);
    const dispatcher = new JobDispatcher(
      new SendVerificationEmailHandler(authCodeDelivery),
      new SendPasswordResetEmailHandler(authCodeDelivery),
      new CleanExpiredTokensHandler(dataSource),
      new CleanExpiredNotificationsHandler(dataSource, config),
      new ProcessMediaHandler(dataSource, storage, config),
      new CleanExpiredUploadsHandler(dataSource, storage, config),
      new FederationDeliverHandler(dataSource, config),
      new ExportAccountHandler(dataSource, storage),
      new PurgeAccountHandler(dataSource, storage),
      new RotateE2eeFrankingKeyHandler(dataSource),
      new E2eeRetentionSweepHandler(dataSource),
    );
    const runner = new JobRunner(dataSource, dispatcher, config);
    return { runner, emailProvider };
  }

  function buildRunnerWithFailingRetention(secret: string): JobRunner {
    const config = fakeConfig({});
    const storage = unusedStorage();
    const authCodeDelivery = new AuthCodeEmailDeliveryService(
      dataSource,
      config,
      new ConsoleEmailProvider(),
    );
    const failingRetention = {
      type: 'E2EE_RETENTION_SWEEP' as const,
      handle: (): Promise<void> => Promise.reject(new Error(secret)),
    };
    return new JobRunner(
      dataSource,
      new JobDispatcher(
        new SendVerificationEmailHandler(authCodeDelivery),
        new SendPasswordResetEmailHandler(authCodeDelivery),
        new CleanExpiredTokensHandler(dataSource),
        new CleanExpiredNotificationsHandler(dataSource, config),
        new ProcessMediaHandler(dataSource, storage, config),
        new CleanExpiredUploadsHandler(dataSource, storage, config),
        new FederationDeliverHandler(dataSource, config),
        new ExportAccountHandler(dataSource, storage),
        new PurgeAccountHandler(dataSource, storage),
        new RotateE2eeFrankingKeyHandler(dataSource),
        failingRetention as unknown as E2eeRetentionSweepHandler,
      ),
      config,
    );
  }

  async function enqueue(
    type: string,
    payload: Record<string, unknown>,
    overrides: Partial<OutboxJob> = {},
  ): Promise<OutboxJob> {
    const repository = dataSource.getRepository(OutboxJob);
    return repository.save(repository.create({ type, payload, ...overrides }));
  }

  async function enqueueVerificationEmail(
    email = 'user@example.com',
    code = '123456',
    overrides: Partial<OutboxJob> = {},
    codeHash = createHash('sha256').update(code).digest('hex'),
  ): Promise<{ job: OutboxJob; authCode: AuthCode }> {
    const { user } = await createTestUser(dataSource.manager, {
      handle: `worker${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      recoveryEmail: `${randomUUID()}@account.example.test`,
    });
    const repository = dataSource.getRepository(AuthCode);
    const authCode = await repository.save(
      repository.create({
        userId: user.id,
        purpose: 'VERIFY_EMAIL',
        codeHash,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
    const payload = encryptAuthCodeDelivery(
      'SEND_VERIFICATION_EMAIL',
      authCode.id,
      { email, code },
      AUTH_CODE_KEY_ID,
      AUTH_CODE_KEYS,
    );
    return { job: await enqueue('SEND_VERIFICATION_EMAIL', payload, overrides), authCode };
  }

  it('processes a SEND_VERIFICATION_EMAIL job end-to-end via the console provider', async () => {
    const { runner, emailProvider } = buildRunner();
    const { job } = await enqueueVerificationEmail();

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
    expect(row.payload).toEqual({ v: 1, redacted: true });
  });

  it('a job whose handler throws is retried with backoff, then dead-lettered', async () => {
    const { runner } = buildRunner();
    const job = await enqueue('SEND_VERIFICATION_EMAIL', { v: 1 }, { maxAttempts: 2 });

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
    expect(dead.lastError).toBe('AUTH_CODE_DELIVERY_FAILED');
    expect(dead.payload).toEqual({ v: 1, redacted: true });
  });

  it('redacts a generic handler failure in retry/dead-letter state and worker logs', async () => {
    const secret = 'ciphertext=opaque-device-7d2a86d1';
    const job = await enqueue(
      'E2EE_RETENTION_SWEEP',
      { scheduledFor: '2026-08-24T00:00:00.000Z' },
      { maxAttempts: 2 },
    );
    const logs: string[] = [];
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
    try {
      const runner = buildRunnerWithFailingRetention(secret);
      const firstRun = runner.run();
      await waitFor(async () => {
        const row = await dataSource.getRepository(OutboxJob).findOneBy({ id: job.id });
        return row?.status === 'PENDING' && row.attempts === 1;
      });
      runner.requestStop();
      await firstRun;

      const retried = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: job.id });
      expect(retried.lastError).toBe('Job handler failed.');
      expect(JSON.stringify(retried)).not.toContain(secret);
      await dataSource
        .getRepository(OutboxJob)
        .update({ id: job.id }, { availableAt: new Date(0) });

      const retryRunner = buildRunnerWithFailingRetention(secret);
      const secondRun = retryRunner.run();
      await waitFor(async () => {
        const row = await dataSource.getRepository(OutboxJob).findOneBy({ id: job.id });
        return row?.status === 'DEAD';
      });
      retryRunner.requestStop();
      await secondRun;
    } finally {
      warn.mockRestore();
    }
    const dead = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: job.id });
    expect(dead.lastError).toBe('Job handler failed.');
    expect(dead.attempts).toBe(2);
    expect(logs.join('\n')).toContain('JOB_HANDLER_FAILED');
    expect(logs.join('\n')).not.toContain(secret);
  });

  it('purges an E2EE device FK graph and removes its issued-key ledger only with the device', async () => {
    const { actor } = await createTestUser(dataSource.manager, {
      handle: `purge${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    });
    const rootId = randomUUID();
    const deviceId = randomUUID();
    await dataSource.getRepository(AccountDeletionRequest).save({
      actorId: actor.id,
      requestedAt: new Date(),
      purgeAfter: new Date(0),
      cancelledAt: null,
      purgedAt: null,
    });
    await dataSource.query(
      `INSERT INTO e2ee_identity_roots (id, actor_id, generation, public_key) VALUES ($1, $2, 1, $3)`,
      [rootId, actor.id, Buffer.alloc(32, 1)],
    );
    await dataSource.query(
      `INSERT INTO e2ee_device_identities (id, actor_id, identity_root_id, device_id, generation, signing_public_key, agreement_public_key, certificate_bytes, root_signature, certificate_created_at, expires_at)
       VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, now(), now() + interval '1 day')`,
      [
        deviceId,
        actor.id,
        rootId,
        randomUUID(),
        Buffer.alloc(32, 2),
        Buffer.alloc(32, 3),
        Buffer.alloc(128, 4),
        Buffer.alloc(64, 5),
      ],
    );
    await dataSource.query(
      `INSERT INTO e2ee_one_time_prekey_key_ids (device_identity_id, key_id) VALUES ($1, 1)`,
      [deviceId],
    );
    await dataSource.query(
      `INSERT INTO e2ee_one_time_prekeys (device_identity_id, key_id, public_key) VALUES ($1, 1, $2)`,
      [deviceId, Buffer.alloc(32, 6)],
    );

    await new PurgeAccountHandler(dataSource, unusedStorage()).handle(
      { actorId: actor.id },
      { jobId: `purge-e2ee-${randomUUID()}`, attempt: 1 },
    );

    const [counts] = await dataSource.query<Array<{ devices: string; ledgers: string }>>(
      `SELECT
         (SELECT count(*) FROM e2ee_device_identities WHERE id = $1) AS devices,
         (SELECT count(*) FROM e2ee_one_time_prekey_key_ids WHERE device_identity_id = $1) AS ledgers`,
      [deviceId],
    );
    expect(counts).toEqual({ devices: '0', ledgers: '0' });
  });

  it('atomically scrubs a terminal auth-email failure and deletes its auth-code row', async () => {
    const { job, authCode } = await enqueueVerificationEmail(
      'mismatch@example.com',
      '123456',
      { maxAttempts: 1 },
      createHash('sha256').update('different').digest('hex'),
    );
    const { runner } = buildRunner();
    const runPromise = runner.run();
    await waitFor(async () => {
      const row = await dataSource.getRepository(OutboxJob).findOneBy({ id: job.id });
      return row?.status === 'DEAD';
    });
    runner.requestStop();
    await runPromise;

    const dead = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: job.id });
    expect(dead.payload).toEqual({ v: 1, redacted: true });
    expect(await dataSource.getRepository(AuthCode).findOneBy({ id: authCode.id })).toBeNull();
  });

  it('two concurrent runners never double-process the same jobs', async () => {
    const providerA = new ConsoleEmailProvider();
    const providerB = new ConsoleEmailProvider();
    const { runner: runnerA } = buildRunner({ workerId: 'worker-a' }, providerA);
    const { runner: runnerB } = buildRunner({ workerId: 'worker-b' }, providerB);

    const jobs = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        enqueueVerificationEmail(`u${String(index)}@example.com`, '000000').then(({ job }) => job),
      ),
    );

    const runA = runnerA.run();
    const runB = runnerB.run();

    // Scope to these jobs' ids, not a whole-table count: inside the 00:00–03:00 UTC
    // scheduling window the runners also legitimately enqueue the daily CLEAN_EXPIRED_
    // NOTIFICATIONS job (B-102), which would otherwise never let this predicate pass.
    const jobIds = jobs.map((job) => job.id);
    await waitFor(async () => {
      const rows = await dataSource.getRepository(OutboxJob).findBy({ id: In(jobIds) });
      return rows.length === jobs.length && rows.every((row) => row.status === 'COMPLETED');
    });

    runnerA.requestStop();
    runnerB.requestStop();
    await Promise.all([runA, runB]);

    // No double-processing: every job was sent by exactly one of the two providers, so the
    // totals must add up to exactly the number enqueued, never more.
    expect(providerA.sent.length + providerB.sent.length).toBe(jobs.length);

    const rows = await dataSource.getRepository(OutboxJob).findBy({ id: In(jobIds) });
    expect(rows.every((row) => row.status === 'COMPLETED')).toBe(true);
  });

  it('concurrent workers racing the daily-cleanup enqueue insert exactly one job', async () => {
    // Regression: `enqueueDailyCleanupIfDue` used check-then-insert, so two runners crossing
    // the 00:00–03:00 UTC scheduling window after a truncate both passed the findOne check and
    // the loser's 23505 rejection killed its run() loop (CI failed only inside that window).
    // The atomic `ON CONFLICT DO NOTHING` helper must let all racers succeed — exactly one row.
    const idempotencyKey = `CLEAN_EXPIRED_NOTIFICATIONS:race-${randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        enqueueOutboxJobIfAbsent(dataSource.manager, {
          type: 'CLEAN_EXPIRED_NOTIFICATIONS',
          payload: {},
          availableAt: new Date(Date.now() + 60_000),
          idempotencyKey,
        }),
      ),
    );
    expect(results.filter((inserted: boolean) => inserted)).toHaveLength(1);
    const scheduled = await dataSource.getRepository(OutboxJob).find({ where: { idempotencyKey } });
    expect(scheduled).toHaveLength(1);
  });

  it('reclaims a job abandoned PROCESSING by a crashed worker (B-013)', async () => {
    // Simulates a worker that claimed the job, then died mid-handler (killed -9, OOM, host
    // failure) without ever reaching markOutboxJobSucceeded/Failed: `locked_at` stops
    // advancing and the row is left `PROCESSING` forever unless something notices.
    const { job: stale } = await enqueueVerificationEmail('stale@example.com', '123456', {
      status: 'PROCESSING',
      lockedAt: new Date(Date.now() - 60_000),
      lockedBy: 'dead-worker',
      attempts: 1,
    });

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
      { v: 1 },
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
