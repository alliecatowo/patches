import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MigrationExecutor } from 'typeorm';
import type { DataSource } from 'typeorm';

import { createDataSource } from '../src/data-source.js';
import { ALL_MIGRATIONS } from '../src/migrations/index.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.warn(
    '[packages/database] Skipping Phase 13 E2EE schema tests: TEST_DATABASE_URL is not set.',
  );
}

describe.skipIf(!testDatabaseUrl)('Phase 13 E2EE schema (integration, real Postgres)', () => {
  let dataSource: DataSource;
  let migrationFixture: { deviceIdentityId: string; keyId: string };

  beforeAll(async () => {
    dataSource = createDataSource({ url: testDatabaseUrl! });
    // Prove the ledger migration against actual existing E2EE rows, rather than only against
    // an empty latest schema. The ledger migration is deliberately last in this release.
    dataSource.setOptions({ migrations: ALL_MIGRATIONS.slice(0, -1) });
    await dataSource.initialize();
    await dataSource.dropDatabase();
    await dataSource.runMigrations();
    const actorId = randomUUID();
    const rootId = randomUUID();
    const deviceIdentityId = randomUUID();
    const keyId = '741';
    await dataSource.query(
      `INSERT INTO actors (id, handle, handle_normalized, is_local) VALUES ($1, $2, $2, true)`,
      [actorId, `preledger_${randomUUID().slice(0, 8)}`],
    );
    await dataSource.query(
      `INSERT INTO e2ee_identity_roots (id, actor_id, generation, public_key) VALUES ($1, $2, 1, $3)`,
      [rootId, actorId, Buffer.alloc(32, 1)],
    );
    await dataSource.query(
      `INSERT INTO e2ee_device_identities (id, actor_id, identity_root_id, device_id, generation, signing_public_key, agreement_public_key, certificate_bytes, root_signature, certificate_created_at, expires_at)
       VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, now(), now() + interval '1 day')`,
      [
        deviceIdentityId,
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
      `INSERT INTO e2ee_one_time_prekeys (device_identity_id, key_id, public_key, consumed_at)
       VALUES ($1, $2, $3, now())`,
      [deviceIdentityId, keyId, Buffer.alloc(32, 6)],
    );
    migrationFixture = { deviceIdentityId, keyId };
    // TypeORM captures migration metadata at initialization, so reconnect with the single
    // target migration rather than mutating an already-initialized source.
    await dataSource.destroy();
    dataSource = createDataSource({ url: testDatabaseUrl! });
    dataSource.setOptions({ migrations: ALL_MIGRATIONS.slice(-1) });
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.destroy();
    dataSource = createDataSource({ url: testDatabaseUrl! });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('creates only the intended public/opaque/evidence tables with no pending migration', async () => {
    const rows = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'e2ee_%' ORDER BY table_name`,
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      'e2ee_device_identities',
      'e2ee_device_rosters',
      'e2ee_group_control_events',
      'e2ee_identity_roots',
      'e2ee_logical_messages',
      'e2ee_mailbox_envelopes',
      'e2ee_node_franking_keys',
      'e2ee_one_time_prekey_key_ids',
      'e2ee_one_time_prekeys',
      'e2ee_report_evidence',
      'e2ee_report_evidence_items',
      'e2ee_signed_prekeys',
    ]);
    expect(await new MigrationExecutor(dataSource).getPendingMigrations()).toHaveLength(0);
  });

  it('backfills existing issued IDs before enforcing the retention FKs and indexes', async () => {
    const ledgers = await dataSource.query<Array<{ key_id: string; consumed_at: Date | null }>>(
      `SELECT key_id, consumed_at FROM e2ee_one_time_prekey_key_ids
       WHERE device_identity_id = $1 AND key_id = $2`,
      [migrationFixture.deviceIdentityId, migrationFixture.keyId],
    );
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]?.consumed_at).not.toBeNull();
    await expect(
      dataSource.query(
        `INSERT INTO e2ee_one_time_prekeys (device_identity_id, key_id, public_key)
         VALUES ($1, 742, $2)`,
        [migrationFixture.deviceIdentityId, Buffer.alloc(32, 7)],
      ),
    ).rejects.toThrow(/fk_e2ee_one_time_prekeys_device_identity_id_key_id/);
    const indexes = await dataSource.query<Array<{ indexname: string; indexdef: string }>>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
       AND indexname IN ('idx_e2ee_mailbox_envelopes_acknowledged_at_id',
                         'idx_e2ee_one_time_prekeys_consumed_at_id',
                         'idx_e2ee_signed_prekeys_retired_at_id')`,
    );
    expect(indexes.map((index) => index.indexname).sort()).toEqual([
      'idx_e2ee_mailbox_envelopes_acknowledged_at_id',
      'idx_e2ee_one_time_prekeys_consumed_at_id',
      'idx_e2ee_signed_prekeys_retired_at_id',
    ]);
    for (const index of indexes) expect(index.indexdef).toMatch(/WHERE .*IS NOT NULL/);
    const constraints = await dataSource.query<
      Array<{ conname: string; contype: string; confdeltype: string; definition: string }>
    >(
      `SELECT conname, contype, confdeltype, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname IN ('pk_e2ee_one_time_prekey_key_ids_device_identity_id_key_id',
                         'fk_e2ee_one_time_prekey_key_ids_device_identity_id',
                         'fk_e2ee_one_time_prekeys_device_identity_id_key_id')`,
    );
    expect(constraints).toHaveLength(3);
    expect(constraints.find((row) => row.conname.startsWith('pk_'))?.definition).toContain(
      'PRIMARY KEY (device_identity_id, key_id)',
    );
    expect(
      constraints.find(
        (row) => row.conname === 'fk_e2ee_one_time_prekey_key_ids_device_identity_id',
      )?.confdeltype,
    ).toBe('c');
    expect(
      constraints.find(
        (row) => row.conname === 'fk_e2ee_one_time_prekeys_device_identity_id_key_id',
      )?.confdeltype,
    ).toBe('r');
    await expect(
      dataSource.query(`SELECT 1 FROM outbox_jobs WHERE type = 'E2EE_RETENTION_SWEEP' LIMIT 1`),
    ).resolves.toEqual([]);
  });

  it('round-trips the issued-ID ledger migration in dependency-safe order', async () => {
    await dataSource.undoLastMigration();

    await expect(
      dataSource.query(`SELECT to_regclass('public.e2ee_one_time_prekey_key_ids') AS relation`),
    ).resolves.toEqual([{ relation: null }]);
    await expect(
      dataSource.query(
        `SELECT conname FROM pg_constraint
         WHERE conname = 'fk_e2ee_one_time_prekeys_device_identity_id_key_id'`,
      ),
    ).resolves.toEqual([]);

    await dataSource.runMigrations();
    await expect(
      dataSource.query(
        `SELECT key_id FROM e2ee_one_time_prekey_key_ids
         WHERE device_identity_id = $1 AND key_id = $2`,
        [migrationFixture.deviceIdentityId, migrationFixture.keyId],
      ),
    ).resolves.toEqual([{ key_id: migrationFixture.keyId }]);
    await expect(
      dataSource.query(
        `INSERT INTO e2ee_one_time_prekeys (device_identity_id, key_id, public_key)
         VALUES ($1, 742, $2)`,
        [migrationFixture.deviceIdentityId, Buffer.alloc(32, 8)],
      ),
    ).rejects.toThrow(/fk_e2ee_one_time_prekeys_device_identity_id_key_id/);
    expect(await new MigrationExecutor(dataSource).getPendingMigrations()).toHaveLength(0);
  });

  it('keeps legacy rows labelled and rejects every conversation mode change', async () => {
    const actorId = randomUUID();
    const conversationId = randomUUID();
    await dataSource.query(
      `INSERT INTO "actors" ("id", "handle", "handle_normalized", "is_local") VALUES ($1, $2, $2, true)`,
      [actorId, `actor_${randomUUID().slice(0, 8)}`],
    );
    await dataSource.query(
      `INSERT INTO "conversations" ("id", "kind", "created_by_actor_id", "last_message_at") VALUES ($1, 'DIRECT', $2, now())`,
      [conversationId, actorId],
    );
    const rows = await dataSource.query<Array<{ security_mode: string }>>(
      `SELECT "security_mode" FROM "conversations" WHERE "id" = $1`,
      [conversationId],
    );
    expect(rows[0]?.security_mode).toBe('LEGACY_SERVER_VISIBLE');
    await expect(
      dataSource.query(`UPDATE "conversations" SET "security_mode" = 'E2EE_V1' WHERE "id" = $1`, [
        conversationId,
      ]),
    ).rejects.toThrow(/immutable/);
  });

  it('enforces key lengths and one active root/device/signed-prekey per identity', async () => {
    const actorId = randomUUID();
    await dataSource.query(
      `INSERT INTO "actors" ("id", "handle", "handle_normalized", "is_local") VALUES ($1, $2, $2, true)`,
      [actorId, `actor_${randomUUID().slice(0, 8)}`],
    );
    const rootId = randomUUID();
    await dataSource.query(
      `INSERT INTO "e2ee_identity_roots" ("id", "actor_id", "generation", "public_key") VALUES ($1, $2, 1, $3)`,
      [rootId, actorId, Buffer.alloc(32, 1)],
    );
    await expect(
      dataSource.query(
        `INSERT INTO "e2ee_identity_roots" ("actor_id", "generation", "public_key") VALUES ($1, 2, $2)`,
        [actorId, Buffer.alloc(32, 2)],
      ),
    ).rejects.toThrow(/idx_e2ee_identity_roots_actor_id"/);
    await expect(
      dataSource.query(
        `INSERT INTO "e2ee_identity_roots" ("actor_id", "generation", "public_key", "rotated_at") VALUES ($1, 2, $2, now())`,
        [actorId, Buffer.alloc(31, 2)],
      ),
    ).rejects.toThrow(/chk_e2ee_identity_roots_key_length/);

    const deviceIdentityId = randomUUID();
    const deviceId = randomUUID();
    await dataSource.query(
      `INSERT INTO "e2ee_device_identities" ("id", "actor_id", "identity_root_id", "device_id", "generation", "signing_public_key", "agreement_public_key", "certificate_bytes", "root_signature", "certificate_created_at", "expires_at") VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, now(), now() + interval '1 day')`,
      [
        deviceIdentityId,
        actorId,
        rootId,
        deviceId,
        Buffer.alloc(32, 3),
        Buffer.alloc(32, 4),
        Buffer.alloc(128, 5),
        Buffer.alloc(64, 6),
      ],
    );
    await dataSource.query(
      `INSERT INTO "e2ee_signed_prekeys" ("device_identity_id", "key_id", "public_key", "signature", "created_at", "expires_at") VALUES ($1, 1, $2, $3, now(), now() + interval '7 days')`,
      [deviceIdentityId, Buffer.alloc(32, 7), Buffer.alloc(64, 8)],
    );
    await expect(
      dataSource.query(
        `INSERT INTO "e2ee_signed_prekeys" ("device_identity_id", "key_id", "public_key", "signature", "created_at", "expires_at") VALUES ($1, 2, $2, $3, now(), now() + interval '7 days')`,
        [deviceIdentityId, Buffer.alloc(32, 9), Buffer.alloc(64, 10)],
      ),
    ).rejects.toThrow(/idx_e2ee_signed_prekeys_device_identity_id"/);
  });
});
