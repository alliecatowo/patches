import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { createDataSource } from '@patches/database';
import { E2EE_MAILBOX_MAX_LATENCY_MS } from '@patches/domain';
import { e2eeRetentionDeletedTotal, e2eeRetentionRunsTotal } from '@patches/observability';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { E2eeRetentionSweepHandler } from '../src/jobs/handlers/e2ee-retention-sweep.handler.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.warn(
    '[apps/worker] Skipping E2EE retention integration tests: TEST_DATABASE_URL is not set.',
  );
}

describe.skipIf(!testDatabaseUrl)('E2EE retention sweep (integration, real Postgres)', () => {
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
    await dataSource.query(
      `TRUNCATE TABLE e2ee_mailbox_envelopes, e2ee_one_time_prekeys, e2ee_one_time_prekey_key_ids, e2ee_signed_prekeys, e2ee_logical_messages, e2ee_device_identities, e2ee_identity_roots, conversations, actors CASCADE`,
    );
  });

  async function fixture(): Promise<{ deviceId: string; conversationId: string }> {
    const actorId = randomUUID();
    const rootId = randomUUID();
    const deviceId = randomUUID();
    const conversationId = randomUUID();
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    await dataSource.query(
      `INSERT INTO actors (id, handle, handle_normalized, is_local) VALUES ($1, $2, $2, true)`,
      [actorId, `retention_${suffix}`],
    );
    await dataSource.query(
      `INSERT INTO e2ee_identity_roots (id, actor_id, generation, public_key) VALUES ($1, $2, 1, $3)`,
      [rootId, actorId, Buffer.alloc(32, 1)],
    );
    await dataSource.query(
      `INSERT INTO e2ee_device_identities (id, actor_id, identity_root_id, device_id, generation, signing_public_key, agreement_public_key, certificate_bytes, root_signature, certificate_created_at, expires_at)
       VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, now(), now() + interval '1 day')`,
      [
        deviceId,
        actorId,
        rootId,
        randomUUID(),
        Buffer.alloc(32, 2),
        Buffer.alloc(32, 3),
        Buffer.alloc(128, 4),
        Buffer.alloc(64, 5),
      ],
    );
    await dataSource.query(
      `INSERT INTO conversations (id, kind, created_by_actor_id, last_message_at) VALUES ($1, 'DIRECT', $2, now())`,
      [conversationId, actorId],
    );
    return { deviceId, conversationId };
  }

  async function insertEnvelopes(
    conversationId: string,
    deviceId: string,
    count: number,
    acknowledgedAt: Date | null,
  ): Promise<void> {
    await dataSource.query(
      `WITH messages AS (
         INSERT INTO e2ee_logical_messages (id, conversation_id, epoch, sender_actor_id, sender_device_id, client_request_id, fanout_digest, franking_commitment, franking_profile, franking_key_era, franking_tag, accepted_at)
         SELECT gen_random_uuid(), $1, 1, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex'), 'patches-franking-v1', 1, decode('03', 'hex'), now()
         FROM generate_series(1, $2)
         RETURNING id
       )
       INSERT INTO e2ee_mailbox_envelopes (logical_message_id, recipient_device_identity_id, encrypted_header, ciphertext, opening_ciphertext, ciphertext_digest, received_at, acknowledged_at)
       SELECT id, $3, decode('04', 'hex'), decode('05', 'hex'), decode('06', 'hex'), decode(repeat('07', 32), 'hex'), now(), $4 FROM messages`,
      [conversationId, count, deviceId, acknowledgedAt],
    );
  }

  async function count(sql: string, values: unknown[]): Promise<number> {
    const rows = await dataSource.query<Array<{ count: string }>>(sql, values);
    return Number(rows[0]?.count ?? 0);
  }

  function retentionTimes(): { oldAt: Date; freshAt: Date } {
    const now = Date.now();
    return {
      oldAt: new Date(now - E2EE_MAILBOX_MAX_LATENCY_MS - 60_000),
      freshAt: new Date(now - E2EE_MAILBOX_MAX_LATENCY_MS + 60_000),
    };
  }

  it('two concurrent sweepers use bounded SKIP LOCKED claims and preserve every non-candidate', async () => {
    const { oldAt, freshAt } = retentionTimes();
    const { deviceId, conversationId } = await fixture();
    await insertEnvelopes(conversationId, deviceId, 1_002, oldAt);
    await insertEnvelopes(conversationId, deviceId, 1, null);
    await insertEnvelopes(conversationId, deviceId, 1, freshAt);

    await dataSource.query(
      `INSERT INTO e2ee_one_time_prekey_key_ids (device_identity_id, key_id, issued_at, consumed_at) VALUES
       ($1, 1, $2, $2), ($1, 2, $2, NULL), ($1, 3, $2, $2)`,
      [deviceId, oldAt],
    );
    await dataSource.query(
      `INSERT INTO e2ee_one_time_prekeys (device_identity_id, key_id, public_key, uploaded_at, consumed_at) VALUES
       ($1, 1, $2, $3, $3), ($1, 2, $2, $3, $3), ($1, 3, $2, $3, $4)`,
      [deviceId, Buffer.alloc(32, 8), oldAt, freshAt],
    );
    // The immutable ledger FK normally makes this malformed historical state impossible. Disable
    // it briefly to prove the sweep's EXISTS fence still retains a public row with no ledger.
    await dataSource.query('ALTER TABLE e2ee_one_time_prekeys DISABLE TRIGGER ALL');
    try {
      await dataSource.query(
        `INSERT INTO e2ee_one_time_prekeys (device_identity_id, key_id, public_key, uploaded_at, consumed_at) VALUES ($1, 99, $2, $3, $3)`,
        [deviceId, Buffer.alloc(32, 9), oldAt],
      );
    } finally {
      await dataSource.query('ALTER TABLE e2ee_one_time_prekeys ENABLE TRIGGER ALL');
    }
    await dataSource.query(
      `INSERT INTO e2ee_signed_prekeys (device_identity_id, key_id, public_key, signature, created_at, expires_at, retired_at) VALUES
       ($1, 1, $2, $3, $4, $5, $4), ($1, 2, $2, $3, $4, $5, NULL), ($1, 3, $2, $3, $4, $5, $6)`,
      [deviceId, Buffer.alloc(32, 10), Buffer.alloc(64, 11), oldAt, freshAt, freshAt],
    );

    const deletedCalls: unknown[][] = [];
    const runCalls: unknown[][] = [];
    const deleted = vi
      .spyOn(e2eeRetentionDeletedTotal, 'inc')
      .mockImplementation((...args: unknown[]) => deletedCalls.push(args));
    const runs = vi
      .spyOn(e2eeRetentionRunsTotal, 'inc')
      .mockImplementation((...args: unknown[]) => runCalls.push(args));
    const logs: string[] = [];
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
    try {
      await Promise.all([
        new E2eeRetentionSweepHandler(dataSource).handle(
          { scheduledFor: '2026-08-24T00:00:00.000Z' },
          { jobId: 'sweeper-a', attempt: 1 },
        ),
        new E2eeRetentionSweepHandler(dataSource).handle(
          { scheduledFor: '2026-08-24T00:00:00.000Z' },
          { jobId: 'sweeper-b', attempt: 1 },
        ),
      ]);
    } finally {
      log.mockRestore();
      deleted.mockRestore();
      runs.mockRestore();
    }

    expect(
      await count(
        `SELECT count(*) FROM e2ee_mailbox_envelopes WHERE recipient_device_identity_id = $1`,
        [deviceId],
      ),
    ).toBe(4);
    expect(
      await count(
        `SELECT count(*) FROM e2ee_mailbox_envelopes WHERE recipient_device_identity_id = $1 AND acknowledged_at IS NOT NULL AND acknowledged_at < $2`,
        [deviceId, new Date(oldAt.getTime() + 1)],
      ),
    ).toBe(2);
    expect(deletedCalls).toContainEqual([{ kind: 'mailbox_envelope' }, 500]);
    expect(
      await count(
        `SELECT count(*) FROM e2ee_mailbox_envelopes WHERE recipient_device_identity_id = $1 AND acknowledged_at IS NULL`,
        [deviceId],
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) FROM e2ee_one_time_prekeys WHERE device_identity_id = $1 AND key_id = 1`,
        [deviceId],
      ),
    ).toBe(0);
    expect(
      await count(
        `SELECT count(*) FROM e2ee_one_time_prekeys WHERE device_identity_id = $1 AND key_id IN (2, 3, 99)`,
        [deviceId],
      ),
    ).toBe(3);
    expect(
      await count(
        `SELECT count(*) FROM e2ee_one_time_prekey_key_ids WHERE device_identity_id = $1 AND key_id = 1`,
        [deviceId],
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) FROM e2ee_signed_prekeys WHERE device_identity_id = $1 AND key_id = 1`,
        [deviceId],
      ),
    ).toBe(0);
    expect(
      await count(
        `SELECT count(*) FROM e2ee_signed_prekeys WHERE device_identity_id = $1 AND key_id IN (2, 3)`,
        [deviceId],
      ),
    ).toBe(2);

    expect(deletedCalls).toContainEqual([{ kind: 'one_time_prekey' }, 1]);
    expect(deletedCalls).toContainEqual([{ kind: 'signed_prekey' }, 1]);
    expect(runCalls).toEqual([[{ outcome: 'succeeded' }], [{ outcome: 'succeeded' }]]);
    expect(logs).toHaveLength(2);
    for (const record of logs.map((line) => JSON.parse(line) as Record<string, unknown>)) {
      expect(Object.keys(record).sort()).toEqual([
        'envelopes',
        'event',
        'oneTimePrekeys',
        'signedPrekeys',
      ]);
      expect(record.event).toBe('e2ee_retention_sweep');
      expect(record.envelopes).toEqual(expect.any(Number));
      expect(record.oneTimePrekeys).toEqual(expect.any(Number));
      expect(record.signedPrekeys).toEqual(expect.any(Number));
    }
  });

  it('rolls back a claimed batch when PostgreSQL rejects its delete', async () => {
    const { oldAt } = retentionTimes();
    const { deviceId, conversationId } = await fixture();
    await insertEnvelopes(conversationId, deviceId, 1, oldAt);
    await dataSource.query(
      `CREATE FUNCTION reject_retention_test_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'retention test delete rejected'; END; $$`,
    );
    await dataSource.query(
      `CREATE TRIGGER reject_retention_test_delete BEFORE DELETE ON e2ee_mailbox_envelopes FOR EACH ROW EXECUTE FUNCTION reject_retention_test_delete()`,
    );
    try {
      await expect(
        new E2eeRetentionSweepHandler(dataSource).handle(
          { scheduledFor: '2026-08-24T00:00:00.000Z' },
          { jobId: 'rollback', attempt: 1 },
        ),
      ).rejects.toThrow('retention test delete rejected');
      expect(
        await count(
          `SELECT count(*) FROM e2ee_mailbox_envelopes WHERE recipient_device_identity_id = $1`,
          [deviceId],
        ),
      ).toBe(1);
    } finally {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS reject_retention_test_delete ON e2ee_mailbox_envelopes',
      );
      await dataSource.query('DROP FUNCTION IF EXISTS reject_retention_test_delete()');
    }
  });

  it('keeps an acknowledgement exactly at the fixed cutoff', async () => {
    const fixedNow = new Date('2026-08-24T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      const { deviceId, conversationId } = await fixture();
      const exactCutoff = new Date(fixedNow.getTime() - E2EE_MAILBOX_MAX_LATENCY_MS);
      await insertEnvelopes(conversationId, deviceId, 1, new Date(exactCutoff.getTime() - 1));
      await insertEnvelopes(conversationId, deviceId, 1, exactCutoff);
      await insertEnvelopes(conversationId, deviceId, 1, new Date(exactCutoff.getTime() + 1));

      await new E2eeRetentionSweepHandler(dataSource).handle(
        { scheduledFor: '2026-08-24T00:00:00.000Z' },
        { jobId: 'cutoff-equality', attempt: 1 },
      );

      expect(
        await count(
          `SELECT count(*) FROM e2ee_mailbox_envelopes
           WHERE recipient_device_identity_id = $1 AND acknowledged_at >= $2`,
          [deviceId, exactCutoff],
        ),
      ).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('deletes exactly one 500-row batch for each prekey kind', async () => {
    const { oldAt, freshAt } = retentionTimes();
    const { deviceId, conversationId } = await fixture();
    await insertEnvelopes(conversationId, deviceId, 501, oldAt);
    await dataSource.query(
      `INSERT INTO e2ee_one_time_prekey_key_ids (device_identity_id, key_id, issued_at, consumed_at)
       SELECT $1, 1000 + series, $2, $2 FROM generate_series(1, 501) series`,
      [deviceId, oldAt],
    );
    await dataSource.query(
      `INSERT INTO e2ee_one_time_prekeys (device_identity_id, key_id, public_key, uploaded_at, consumed_at)
       SELECT $1, 1000 + series, decode(repeat('08', 32), 'hex'), $2, $2
       FROM generate_series(1, 501) series`,
      [deviceId, oldAt],
    );
    await dataSource.query(
      `INSERT INTO e2ee_signed_prekeys (device_identity_id, key_id, public_key, signature, created_at, expires_at, retired_at)
       SELECT $1, 1000 + series, decode(repeat('09', 32), 'hex'), decode(repeat('0a', 64), 'hex'), $2, $3, $2
       FROM generate_series(1, 501) series`,
      [deviceId, oldAt, freshAt],
    );

    await new E2eeRetentionSweepHandler(dataSource).handle(
      { scheduledFor: '2026-08-24T00:00:00.000Z' },
      { jobId: 'one-batch-per-kind', attempt: 1 },
    );

    await expect(
      count(`SELECT count(*) FROM e2ee_mailbox_envelopes WHERE recipient_device_identity_id = $1`, [
        deviceId,
      ]),
    ).resolves.toBe(1);
    await expect(
      count(`SELECT count(*) FROM e2ee_one_time_prekeys WHERE device_identity_id = $1`, [deviceId]),
    ).resolves.toBe(1);
    await expect(
      count(`SELECT count(*) FROM e2ee_signed_prekeys WHERE device_identity_id = $1`, [deviceId]),
    ).resolves.toBe(1);
  });
});
