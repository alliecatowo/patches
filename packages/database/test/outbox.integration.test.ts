import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../src/data-source.js';
import { Actor } from '../src/entities/actor.entity.js';
import { AuthCode } from '../src/entities/auth-code.entity.js';
import { OutboxJob } from '../src/entities/outbox-job.entity.js';
import { User } from '../src/entities/user.entity.js';
import { AuthCodeDeliveryEnvelopes1787420562003 } from '../src/migrations/1787420562003-AuthCodeDeliveryEnvelopes.js';
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
        type: 'CLEAN_EXPIRED_TOKENS',
        payload: {},
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
      await markOutboxJobSucceeded(manager, claimed!.id, {
        workerId: claimed!.lockedBy!,
        lockedAt: claimed!.lockedAt!,
      });
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
      return markOutboxJobFailed(manager, claimed!.id, {
        claim: { workerId: claimed!.lockedBy!, lockedAt: claimed!.lockedAt! },
        error: 'smtp unavailable',
      });
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
      return markOutboxJobFailed(manager, claimed!.id, {
        claim: { workerId: claimed!.lockedBy!, lockedAt: claimed!.lockedAt! },
        error: 'smtp unavailable',
      });
    });
    expect(second).toBe('DEAD');

    const dead = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: job.id });
    expect(dead.status).toBe('DEAD');
    // Dead jobs are retained for operator inspection/replay, never deleted (jobs.md §6).
    expect(dead.attempts).toBe(2);
  });

  // S-002 (`OutboxCircuitBreaker`, `docs/operations/abuse-protection.md`).
  it('excludeTypes skips a due job of that type while still claiming other due types', async () => {
    await enqueue({ type: 'SEND_VERIFICATION_EMAIL', payload: { v: 1 } });
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

  it('ignores a stale success after the same worker id reclaims a newer lease', async () => {
    const job = await enqueue();
    const firstLockedAt = new Date('2030-08-22T18:00:00.000Z');
    const secondLockedAt = new Date('2030-08-22T18:01:00.000Z');
    const [firstClaim] = await dataSource.transaction((manager) =>
      claimOutboxJobs(manager, { workerId: 'worker-a', now: firstLockedAt }),
    );
    await dataSource
      .getRepository(OutboxJob)
      .update({ id: job.id }, { status: 'PENDING', lockedAt: null, lockedBy: null });
    const [secondClaim] = await dataSource.transaction((manager) =>
      // A restarted process can keep the same configured worker id; locked_by alone is not
      // a sufficient claim token, so this test makes locked_at the only differing field.
      claimOutboxJobs(manager, { workerId: 'worker-a', now: secondLockedAt }),
    );

    expect(
      await markOutboxJobSucceeded(dataSource.manager, job.id, {
        workerId: firstClaim!.lockedBy!,
        lockedAt: firstClaim!.lockedAt!,
      }),
    ).toBe(false);
    expect(await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: job.id })).toEqual(
      expect.objectContaining({
        status: 'PROCESSING',
        lockedBy: 'worker-a',
        lockedAt: secondClaim!.lockedAt,
      }),
    );
  });

  it('ignores a stale terminal failure without deleting its auth code', async () => {
    const codeRepository = dataSource.getRepository(AuthCode);
    const handle = `lease${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const actor = await dataSource.getRepository(Actor).save({
      handle,
      handleNormalized: handle,
      displayName: handle,
      isLocal: true,
      userId: null,
    });
    const user = await dataSource.getRepository(User).save({
      recoveryEmail: `${handle}@example.test`,
      recoveryEmailNormalized: `${handle}@example.test`,
      emailVerifiedAt: null,
      status: 'ACTIVE',
      actorId: actor.id,
    });
    await dataSource.getRepository(Actor).update({ id: actor.id }, { userId: user.id });
    const authCode = await codeRepository.save({
      userId: user.id,
      purpose: 'VERIFY_EMAIL',
      codeHash: 'lease-race-hash',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const job = await enqueue({
      type: 'SEND_VERIFICATION_EMAIL',
      maxAttempts: 1,
      payload: { v: 1, authCodeId: authCode.id, malformed: true },
    });
    const [firstClaim] = await dataSource.transaction((manager) =>
      claimOutboxJobs(manager, { workerId: 'worker-a' }),
    );
    await dataSource
      .getRepository(OutboxJob)
      .update({ id: job.id }, { status: 'PENDING', lockedAt: null, lockedBy: null });
    await dataSource.transaction((manager) => claimOutboxJobs(manager, { workerId: 'worker-b' }));

    expect(
      await dataSource.transaction((manager) =>
        markOutboxJobFailed(manager, job.id, {
          claim: { workerId: firstClaim!.lockedBy!, lockedAt: firstClaim!.lockedAt! },
          error: 'stale failure',
        }),
      ),
    ).toBeNull();
    expect(await codeRepository.findOneBy({ id: authCode.id })).not.toBeNull();
  });

  it('invalidates an extractable auth code when a malformed envelope dead-letters', async () => {
    const handle = `badenv${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const actor = await dataSource.getRepository(Actor).save({
      handle,
      handleNormalized: handle,
      displayName: handle,
      isLocal: true,
      userId: null,
    });
    const user = await dataSource.getRepository(User).save({
      recoveryEmail: `${handle}@example.test`,
      recoveryEmailNormalized: `${handle}@example.test`,
      emailVerifiedAt: null,
      status: 'ACTIVE',
      actorId: actor.id,
    });
    await dataSource.getRepository(Actor).update({ id: actor.id }, { userId: user.id });
    const authCode = await dataSource.getRepository(AuthCode).save({
      userId: user.id,
      purpose: 'VERIFY_EMAIL',
      codeHash: 'malformed-envelope-hash',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const job = await enqueue({
      type: 'SEND_VERIFICATION_EMAIL',
      maxAttempts: 1,
      payload: { v: 1, authCodeId: authCode.id, ciphertext: 'malformed' },
    });
    const [claimed] = await dataSource.transaction((manager) =>
      claimOutboxJobs(manager, { workerId: 'worker' }),
    );

    expect(
      await dataSource.transaction((manager) =>
        markOutboxJobFailed(manager, job.id, {
          claim: { workerId: claimed!.lockedBy!, lockedAt: claimed!.lockedAt! },
          error: 'malformed envelope',
        }),
      ),
    ).toBe('DEAD');
    expect(await dataSource.getRepository(AuthCode).findOneBy({ id: authCode.id })).toBeNull();
    const dead = await dataSource.getRepository(OutboxJob).findOneByOrFail({ id: job.id });
    expect(dead.payload).toEqual({ v: 1, redacted: true });
    expect(dead.lastError).toBe('AUTH_CODE_DELIVERY_FAILED');
  });

  it('rejects legacy plaintext auth-email payload fields at the database boundary', async () => {
    await expect(
      dataSource.getRepository(OutboxJob).insert({
        type: 'SEND_VERIFICATION_EMAIL',
        payload: { userId: 'user-id', email: 'person@example.test', code: 'plaintext-secret' },
      }),
    ).rejects.toThrow(/chk_outbox_jobs_auth_email_payload/);
  });

  it('migration irreversibly scrubs legacy jobs and invalidates undelivered codes', async () => {
    const migration = new AuthCodeDeliveryEnvelopes1787420562003();
    const runner = dataSource.createQueryRunner();
    let constraintRestored = true;
    const actors = dataSource.getRepository(Actor);
    const users = dataSource.getRepository(User);
    const handle = `legacy${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const actor = await actors.save(
      actors.create({
        handle,
        handleNormalized: handle,
        displayName: handle,
        isLocal: true,
        userId: null,
      }),
    );
    const user = await users.save(
      users.create({
        recoveryEmail: `${handle}@example.test`,
        recoveryEmailNormalized: `${handle}@example.test`,
        emailVerifiedAt: null,
        status: 'ACTIVE',
        actorId: actor.id,
      }),
    );
    await actors.update({ id: actor.id }, { userId: user.id });
    const codes = dataSource.getRepository(AuthCode);
    const pendingCode = await codes.save(
      codes.create({
        userId: user.id,
        purpose: 'VERIFY_EMAIL',
        codeHash: 'pending-hash',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
    const completedCode = await codes.save(
      codes.create({
        userId: user.id,
        purpose: 'RESET_PASSWORD',
        codeHash: 'completed-hash',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );

    await runner.connect();
    try {
      await migration.down(runner);
      constraintRestored = false;
      await enqueue({
        type: 'SEND_VERIFICATION_EMAIL',
        payload: {
          userId: user.id,
          authCodeId: pendingCode.id,
          email: `${handle}@example.test`,
          code: 'pending-plaintext',
        },
      });
      await enqueue({
        type: 'SEND_PASSWORD_RESET_EMAIL',
        status: 'COMPLETED',
        payload: {
          userId: user.id,
          authCodeId: completedCode.id,
          email: `${handle}@example.test`,
          code: 'completed-plaintext',
        },
      });
      await migration.up(runner);
      constraintRestored = true;
    } finally {
      // Never poison later tests (or a developer's shared local test database) if fixture
      // insertion or the migration assertion fails after the constraint was dropped.
      if (!constraintRestored) await migration.up(runner);
      await runner.release();
    }

    const migrated = await dataSource.getRepository(OutboxJob).find({ order: { id: 'ASC' } });
    expect(migrated).toEqual([
      expect.objectContaining({
        status: 'DEAD',
        payload: { v: 1, redacted: true },
        lastError: 'AUTH_CODE_DELIVERY_LEGACY_REDACTED',
      }),
      expect.objectContaining({
        status: 'COMPLETED',
        payload: { v: 1, redacted: true },
        lastError: null,
      }),
    ]);
    expect(await codes.findOneBy({ id: pendingCode.id })).toBeNull();
    expect(await codes.findOneBy({ id: completedCode.id })).not.toBeNull();
  });
});
