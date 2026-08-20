import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MigrationExecutor } from 'typeorm';
import type { DataSource } from 'typeorm';

import { createDataSource } from '../src/data-source.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.warn(
    '[packages/database] Skipping Phase 13 E2EE schema tests: TEST_DATABASE_URL is not set.',
  );
}

describe.skipIf(!testDatabaseUrl)('Phase 13 E2EE schema (integration, real Postgres)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createDataSource({ url: testDatabaseUrl! });
    await dataSource.initialize();
    await dataSource.dropDatabase();
    await dataSource.runMigrations();
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
      'e2ee_identity_roots',
      'e2ee_logical_messages',
      'e2ee_mailbox_envelopes',
      'e2ee_node_franking_keys',
      'e2ee_one_time_prekeys',
      'e2ee_report_evidence',
      'e2ee_report_evidence_items',
      'e2ee_signed_prekeys',
    ]);
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
