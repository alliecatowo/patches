import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Issue #297: `Adr0033IdentityTranscriptCleanBreak1787800000000` wiped every row signed under the
 * retired node-canonical transcript encoding, but a pre-transcript *web* build kept publishing
 * `e2ee_identity_roots` rows with `root_bytes`/`self_signature` left NULL after that clean break
 * landed (the column pair stayed nullable — `E2eeIdentityRootTranscript1787790938656` — precisely
 * so that publish path could still write). Owner decision: no legacy tolerance. Any actor still
 * carrying a transcript-less root is purged wholesale (not just the bad root row) and the columns
 * become NOT NULL so a future write can never recreate the gap.
 *
 * Deleted, in FK order (`e2ee_mailbox_envelopes` → … → `e2ee_identity_roots`), scoped to affected
 * actors only via three transaction-local temp tables:
 *   - `e2ee_mailbox_envelopes`   (→ `e2ee_device_identities` via `recipient_device_identity_id`)
 *   - `e2ee_one_time_prekeys`    (→ `e2ee_device_identities` via `device_identity_id`)
 *   - `e2ee_one_time_prekey_key_ids` (→ `e2ee_device_identities`; must follow `e2ee_one_time_prekeys`
 *     — it's RESTRICT-referenced by that table's `issued_key_id` FK)
 *   - `e2ee_signed_prekeys`      (→ `e2ee_device_identities`)
 *   - `e2ee_device_identities`   (→ `e2ee_identity_roots` and `actors`, both CASCADE)
 *   - `e2ee_device_rosters`      (→ `actors`, actor-keyed directly, not via a root)
 *   - `e2ee_device_link_offers`  (→ `actors`, actor-keyed directly, not via a root)
 *   - `e2ee_identity_roots`      (every root for an affected actor, not only the NULL one)
 *
 * Not touched: `e2ee_logical_messages`/`e2ee_group_control_events` (`senderActorId`/
 * `subjectActorId`/`signerActorId` are deliberately FK-less evidence columns that outlive account
 * deletion — see those entities' own comments) and `e2ee_report_evidence(_items)` (report-keyed,
 * not actor-keyed). `e2ee_node_franking_keys` is node-owned, not actor data.
 *
 * `down()` only drops the NOT NULL constraints — the deleted rows are gone, there is nothing to
 * restore them to.
 */
export class E2eeRequireIdentityRootTranscript1787880585000 implements MigrationInterface {
  name = 'E2eeRequireIdentityRootTranscript1787880585000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TEMPORARY TABLE "affected_actors" ON COMMIT DROP AS
      SELECT DISTINCT "actor_id" FROM "e2ee_identity_roots"
      WHERE "root_bytes" IS NULL OR "self_signature" IS NULL
    `);

    await queryRunner.query(`
      CREATE TEMPORARY TABLE "affected_devices" ON COMMIT DROP AS
      SELECT "id" FROM "e2ee_device_identities"
      WHERE "actor_id" IN (SELECT "actor_id" FROM "affected_actors")
    `);

    await queryRunner.query(`
      DELETE FROM "e2ee_mailbox_envelopes"
      WHERE "recipient_device_identity_id" IN (SELECT "id" FROM "affected_devices")
    `);

    await queryRunner.query(`
      DELETE FROM "e2ee_one_time_prekeys"
      WHERE "device_identity_id" IN (SELECT "id" FROM "affected_devices")
    `);

    await queryRunner.query(`
      DELETE FROM "e2ee_one_time_prekey_key_ids"
      WHERE "device_identity_id" IN (SELECT "id" FROM "affected_devices")
    `);

    await queryRunner.query(`
      DELETE FROM "e2ee_signed_prekeys"
      WHERE "device_identity_id" IN (SELECT "id" FROM "affected_devices")
    `);

    await queryRunner.query(`
      DELETE FROM "e2ee_device_identities"
      WHERE "id" IN (SELECT "id" FROM "affected_devices")
    `);

    await queryRunner.query(`
      DELETE FROM "e2ee_device_rosters"
      WHERE "actor_id" IN (SELECT "actor_id" FROM "affected_actors")
    `);

    await queryRunner.query(`
      DELETE FROM "e2ee_device_link_offers"
      WHERE "actor_id" IN (SELECT "actor_id" FROM "affected_actors")
    `);

    await queryRunner.query(`
      DELETE FROM "e2ee_identity_roots"
      WHERE "actor_id" IN (SELECT "actor_id" FROM "affected_actors")
    `);

    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" ALTER COLUMN "root_bytes" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" ALTER COLUMN "self_signature" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" ALTER COLUMN "self_signature" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" ALTER COLUMN "root_bytes" DROP NOT NULL`,
    );
  }
}
