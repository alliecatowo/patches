import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MigrationExecutor } from 'typeorm';
import type { DataSource } from 'typeorm';

import { createDataSource } from '../src/data-source.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.warn(
    '[packages/database] Skipping Phase 14 Amendment C schema tests: TEST_DATABASE_URL is not set.',
  );
}

/** Inserts a minimal local actor and returns its id — every table under test hangs off at
 * least one actor. */
async function insertActor(dataSource: DataSource): Promise<string> {
  const actorId = randomUUID();
  await dataSource.query(
    `INSERT INTO "actors" ("id", "handle", "handle_normalized", "is_local") VALUES ($1, $2, $2, true)`,
    [actorId, `actor_${randomUUID().slice(0, 8)}`],
  );
  return actorId;
}

async function insertCommunity(dataSource: DataSource, createdByActorId: string): Promise<string> {
  const communityId = randomUUID();
  await dataSource.query(
    `INSERT INTO "communities" ("id", "name", "display_name", "created_by_actor_id") VALUES ($1, $2, $2, $3)`,
    [communityId, `c${randomUUID().replace(/-/g, '').slice(0, 10)}`, createdByActorId],
  );
  return communityId;
}

describe.skipIf(!testDatabaseUrl)(
  'Phase 14 Amendment C schema (integration, real Postgres)',
  () => {
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

    it('applies every Phase 14 migration with no pending migration left', async () => {
      expect(await new MigrationExecutor(dataSource).getPendingMigrations()).toHaveLength(0);
      const rows = await dataSource.query<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (
        'actor_privacy_prefs', 'filters', 'filter_scopes', 'filter_terms',
        'filter_lists', 'filter_list_entries', 'filter_list_subscriptions', 'filter_list_exceptions',
        'labelers', 'labels', 'labeler_subscriptions', 'labeler_subscription_actions',
        'appeals', 'moderation_log_entries', 'account_deletion_requests', 'account_exports'
      ) ORDER BY table_name`,
      );
      expect(rows.map((row) => row.table_name)).toEqual([
        'account_deletion_requests',
        'account_exports',
        'actor_privacy_prefs',
        'appeals',
        'filter_list_entries',
        'filter_list_exceptions',
        'filter_list_subscriptions',
        'filter_lists',
        'filter_scopes',
        'filter_terms',
        'filters',
        'labeler_subscription_actions',
        'labeler_subscriptions',
        'labelers',
        'labels',
        'moderation_log_entries',
      ]);
    });

    it('one row per actor, defaults all true except locked (§197.5)', async () => {
      const actorId = await insertActor(dataSource);
      await dataSource.query(`INSERT INTO "actor_privacy_prefs" ("actor_id") VALUES ($1)`, [
        actorId,
      ]);
      const rows = await dataSource.query<
        Array<{
          discoverable: boolean;
          indexable: boolean;
          show_in_local_feed: boolean;
          locked: boolean;
        }>
      >(`SELECT * FROM "actor_privacy_prefs" WHERE "actor_id" = $1`, [actorId]);
      expect(rows[0]).toMatchObject({
        discoverable: true,
        indexable: true,
        show_in_local_feed: true,
        locked: false,
      });
    });

    it('rejects a filter action outside HIDE/COLLAPSE/WARN', async () => {
      const actorId = await insertActor(dataSource);
      await expect(
        dataSource.query(
          `INSERT INTO "filters" ("actor_id", "name", "action") VALUES ($1, 'spoilers', 'DELETE')`,
          [actorId],
        ),
      ).rejects.toThrow(/chk_filters_action/);
    });

    it('enforces exactly one owner on filter_lists and unique (owner, name)', async () => {
      const actorId = await insertActor(dataSource);
      const communityId = await insertCommunity(dataSource, actorId);

      await expect(
        dataSource.query(
          `INSERT INTO "filter_lists" ("name", "display_name") VALUES ('no-owner', 'No Owner')`,
        ),
      ).rejects.toThrow(/chk_filter_lists_one_owner/);

      await expect(
        dataSource.query(
          `INSERT INTO "filter_lists" ("owner_actor_id", "owner_community_id", "name", "display_name") VALUES ($1, $2, 'both-owners', 'Both')`,
          [actorId, communityId],
        ),
      ).rejects.toThrow(/chk_filter_lists_one_owner/);

      await dataSource.query(
        `INSERT INTO "filter_lists" ("owner_actor_id", "name", "display_name") VALUES ($1, 'spam-2026', 'Spam 2026')`,
        [actorId],
      );
      await expect(
        dataSource.query(
          `INSERT INTO "filter_lists" ("owner_actor_id", "name", "display_name") VALUES ($1, 'spam-2026', 'Spam 2026 Dup')`,
          [actorId],
        ),
      ).rejects.toThrow(/idx_filter_lists_name_owner_actor_id/);
    });

    it('enforces exactly one of actor_id/community_id/is_node_labeler on labelers', async () => {
      const actorId = await insertActor(dataSource);

      await expect(
        dataSource.query(`INSERT INTO "labelers" ("vocabulary") VALUES ('[]'::jsonb)`),
      ).rejects.toThrow(/chk_labelers_one_owner/);

      await expect(
        dataSource.query(
          `INSERT INTO "labelers" ("actor_id", "is_node_labeler", "vocabulary") VALUES ($1, true, '[]'::jsonb)`,
          [actorId],
        ),
      ).rejects.toThrow(/chk_labelers_one_owner/);

      await dataSource.query(
        `INSERT INTO "labelers" ("is_node_labeler", "vocabulary") VALUES (true, '[]'::jsonb)`,
      );
      await dataSource.query(
        `INSERT INTO "labelers" ("actor_id", "vocabulary") VALUES ($1, '[]'::jsonb)`,
        [actorId],
      );
    });

    it('enforces exactly one subject column on labels, matching subject_type', async () => {
      const actorId = await insertActor(dataSource);
      const [labelerRow] = await dataSource.query<Array<{ id: string }>>(
        `INSERT INTO "labelers" ("is_node_labeler", "vocabulary") VALUES (true, '[]'::jsonb) RETURNING "id"`,
      );
      const labelerId = labelerRow!.id;

      await expect(
        dataSource.query(
          `INSERT INTO "labels" ("labeler_id", "subject_type", "subject_actor_id", "value") VALUES ($1, 'POST', $2, 'spam')`,
          [labelerId, actorId],
        ),
      ).rejects.toThrow(/chk_labels_subject_matches_type/);

      await dataSource.query(
        `INSERT INTO "labels" ("labeler_id", "subject_type", "subject_actor_id", "value") VALUES ($1, 'ACTOR', $2, 'spam')`,
        [labelerId, actorId],
      );
    });

    it('enforces one appeal per admin_audit_log row', async () => {
      const actorId = await insertActor(dataSource);
      const adminUserId = randomUUID();
      const [auditRow] = await dataSource.query<Array<{ id: string }>>(
        `INSERT INTO "admin_audit_log" ("admin_user_id", "action", "subject_type", "subject_id") VALUES ($1, 'user.suspend', 'USER', $2) RETURNING "id"`,
        [adminUserId, actorId],
      );
      const auditLogId = auditRow!.id;

      await dataSource.query(
        `INSERT INTO "appeals" ("actor_id", "admin_audit_log_id", "statement") VALUES ($1, $2, 'please reconsider')`,
        [actorId, auditLogId],
      );
      await expect(
        dataSource.query(
          `INSERT INTO "appeals" ("actor_id", "admin_audit_log_id", "statement") VALUES ($1, $2, 'again')`,
          [actorId, auditLogId],
        ),
      ).rejects.toThrow(/idx_appeals_admin_audit_log_id/);
    });

    it('requires subject_domain iff subject_kind is DOMAIN on moderation_log_entries', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "moderation_log_entries" ("action", "subject_kind", "subject_domain", "reason_category") VALUES ('DOMAIN_BLOCK', 'ACCOUNT', 'example.com', 'SPAM')`,
        ),
      ).rejects.toThrow(/chk_moderation_log_entries_subject_domain/);

      await expect(
        dataSource.query(
          `INSERT INTO "moderation_log_entries" ("action", "subject_kind", "reason_category") VALUES ('DOMAIN_BLOCK', 'DOMAIN', 'SPAM')`,
        ),
      ).rejects.toThrow(/chk_moderation_log_entries_subject_domain/);

      await dataSource.query(
        `INSERT INTO "moderation_log_entries" ("action", "subject_kind", "subject_domain", "reason_category") VALUES ('DOMAIN_BLOCK', 'DOMAIN', 'example.com', 'SPAM')`,
      );
      await dataSource.query(
        `INSERT INTO "moderation_log_entries" ("action", "subject_kind", "reason_category") VALUES ('SUSPEND', 'ACCOUNT', 'HARASSMENT')`,
      );
    });

    it('defaults domain_blocks reason_category/source and rejects an out-of-vocabulary category', async () => {
      await dataSource.query(`INSERT INTO "domain_blocks" ("domain") VALUES ('spam.example')`);
      const rows = await dataSource.query<Array<{ reason_category: string; source: string }>>(
        `SELECT "reason_category", "source" FROM "domain_blocks" WHERE "domain" = 'spam.example'`,
      );
      expect(rows[0]).toEqual({ reason_category: 'OTHER', source: 'MANUAL' });

      await expect(
        dataSource.query(
          `INSERT INTO "domain_blocks" ("domain", "reason_category") VALUES ('bad.example', 'NOT_A_CATEGORY')`,
        ),
      ).rejects.toThrow(/chk_domain_blocks_reason_category/);
    });

    it('scopes account_deletion_requests and account_exports to one actor row/list respectively', async () => {
      const actorId = await insertActor(dataSource);
      await dataSource.query(
        `INSERT INTO "account_deletion_requests" ("actor_id", "requested_at", "purge_after") VALUES ($1, now(), now() + interval '30 days')`,
        [actorId],
      );
      await expect(
        dataSource.query(
          `INSERT INTO "account_deletion_requests" ("actor_id", "requested_at", "purge_after") VALUES ($1, now(), now() + interval '30 days')`,
          [actorId],
        ),
      ).rejects.toThrow(/pk_account_deletion_requests_actor_id/);

      await dataSource.query(`INSERT INTO "account_exports" ("actor_id") VALUES ($1)`, [actorId]);
      const exports = await dataSource.query<Array<{ status: string }>>(
        `SELECT "status" FROM "account_exports" WHERE "actor_id" = $1`,
        [actorId],
      );
      expect(exports[0]?.status).toBe('PENDING');
    });
  },
);
