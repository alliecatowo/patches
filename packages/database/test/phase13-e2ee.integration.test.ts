import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MigrationExecutor } from 'typeorm';
import type { DataSource } from 'typeorm';

import { createDataSource } from '../src/data-source.js';
import { ALL_MIGRATIONS } from '../src/migrations/index.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

// The ledger migration is located BY NAME, never by position: slicing [-1] broke when
// later migrations landed after it (FilterListScopes, RemoveLegacyServerVisibleDms),
// building a schema that already had the composite prekey FK — the fixture insert then
// failed with fk_e2ee_one_time_prekeys_device_identity_id_key_id (main CI, 2026-08-25).
const LEDGER_MIGRATION_NAME = 'AddE2eeIssuedPrekeyLedger1787617557448';
const ledgerIndex = ALL_MIGRATIONS.findIndex((m) => m.name === LEDGER_MIGRATION_NAME);
if (ledgerIndex === -1) {
  throw new Error(`${LEDGER_MIGRATION_NAME} not found in ALL_MIGRATIONS — update this test`);
}

// Same "locate BY NAME" reasoning as the ledger migration above: this row-deleting migration
// (ADR 0033 §5) must stay excluded from this file's scoped chain regardless of what lands
// after it in `ALL_MIGRATIONS` — a positional `-1` (the actual chain tip) silently stopped
// excluding it the moment `DropE2eeConversationMembershipEvents…` was appended (#270).
const IRREVERSIBLE_TIP_MIGRATION_NAME = 'Adr0033IdentityTranscriptCleanBreak1787800000000';
const irreversibleTipIndex = ALL_MIGRATIONS.findIndex(
  (m) => m.name === IRREVERSIBLE_TIP_MIGRATION_NAME,
);
if (irreversibleTipIndex === -1) {
  throw new Error(
    `${IRREVERSIBLE_TIP_MIGRATION_NAME} not found in ALL_MIGRATIONS — update this test`,
  );
}

// Everything from the ledger onward except the irreversible migration itself — not
// `ALL_MIGRATIONS.slice(ledgerIndex, irreversibleTipIndex)`, which silently dropped anything
// appended after it (e.g. `DropE2eeConversationMembershipEvents…`, #270) too.
const scopedMigrations = [
  ...ALL_MIGRATIONS.slice(ledgerIndex, irreversibleTipIndex),
  ...ALL_MIGRATIONS.slice(irreversibleTipIndex + 1),
];

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
    // an empty latest schema: migrate to just BEFORE the ledger, insert fixture rows, then
    // run the ledger (and anything after it) on top.
    dataSource.setOptions({ migrations: ALL_MIGRATIONS.slice(0, ledgerIndex) });
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
    // The ledger and everything appended after it, in order, minus the irreversible migration
    // — the final state must be fully migrated ("no pending migration" assertion below).
    // `Adr0033IdentityTranscriptCleanBreak…` (ADR 0033 §5) deletes every row in these same
    // E2EE tables regardless of encoding, which would erase this file's own pre-ledger fixture
    // before the assertions below ever see it. That migration is orthogonal to what this file
    // tests (the ledger's dependency-safe FK/index backfill) and is exercised in full elsewhere
    // (`app-meta.integration.test.ts`, `phase1-schema.integration.test.ts`, both of which run
    // the complete, unscoped `ALL_MIGRATIONS` chain via `createDataSource`).
    dataSource.setOptions({ migrations: scopedMigrations });
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.destroy();
    dataSource = createDataSource({ url: testDatabaseUrl! });
    // Same scoped chain as above, not the default full `ALL_MIGRATIONS` — every `it` below
    // (including the undo/redo round trip) must stay within `scopedMigrations`, or
    // `runMigrations()`/`undoLastMigration()` would reach the excluded irreversible migration
    // and wipe this file's fixture out from under it.
    dataSource.setOptions({ migrations: scopedMigrations });
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
      'e2ee_device_link_offers',
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
    // Undo from the ledger onward (migrations after the ledger pop first), so the
    // DB ends at the pre-ledger schema — exactly what the assertions below expect. This
    // dataSource's configured chain is `scopedMigrations` (see the comment in `beforeAll`),
    // so the undo count matches that scoped chain's length.
    for (let i = scopedMigrations.length; i > 0; i--) {
      await dataSource.undoLastMigration();
    }

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

  it('defaults new conversations to E2EE_V1 and still rejects every mode change', async () => {
    // Updated for RemoveLegacyServerVisibleDms (post-ADR 0031): LEGACY_SERVER_VISIBLE is
    // gone — the column default is E2EE_V1 and the CHECK admits only that value. The
    // immutability trigger (Phase13E2ee, ADR 0020 §1.1) is unchanged.
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
    expect(rows[0]?.security_mode).toBe('E2EE_V1');
    await expect(
      dataSource.query(
        `UPDATE "conversations" SET "security_mode" = 'LEGACY_SERVER_VISIBLE' WHERE "id" = $1`,
        [conversationId],
      ),
    ).rejects.toThrow(/immutable|chk_conversations_security_mode/);
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
