import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backend hardening backlog (B-024..B-028, B-030): `ssh_login_challenges.purpose`/
 * `bound_user_id`/`bound_fingerprint` (B-025, replacing the JSON-in-`claimed_handle`
 * enrollment-binding hack) and `federation_keys.private_key_ciphertext`/`private_key_iv`/
 * `private_key_tag` (B-026, replacing the plain `private_key_pem` column with AES-256-GCM
 * ciphertext — see `packages/database/src/crypto/federation-key-cipher.ts`). Also widens
 * `chk_admin_audit_log_subject_type` to add `'DOMAIN'` (B-027's `patches-admin domain
 * block|unblock`) — hand-added below since `migration:generate`'s diff doesn't compare
 * existing CHECK constraint bodies. Generated with `pnpm db:generate`, reviewed, then
 * formatted to match the rest of this package.
 */
export class Phase9Hardening1787082699518 implements MigrationInterface {
  name = 'Phase9Hardening1787082699518';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "federation_keys" DROP COLUMN "private_key_pem"`);
    await queryRunner.query(
      `ALTER TABLE "federation_keys" ADD "private_key_ciphertext" bytea NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "federation_keys" ADD "private_key_iv" bytea NOT NULL`);
    await queryRunner.query(`ALTER TABLE "federation_keys" ADD "private_key_tag" bytea NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "ssh_login_challenges" ADD "purpose" text NOT NULL DEFAULT 'LOGIN'`,
    );
    await queryRunner.query(`ALTER TABLE "ssh_login_challenges" ADD "bound_user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "ssh_login_challenges" ADD "bound_fingerprint" text`);
    await queryRunner.query(
      `ALTER TABLE "ssh_login_challenges" ADD CONSTRAINT "chk_ssh_login_challenges_purpose" CHECK ("purpose" IN ('LOGIN', 'ENROLL'))`,
    );
    // Not TypeORM-generated: `migration:generate`'s schema diff does not compare existing
    // CHECK constraint bodies (docs/agents/LEARNINGS.md), so widening
    // `chk_admin_audit_log_subject_type` to add 'DOMAIN' (B-027's `domain block`/`unblock`
    // admin-audit rows) has to be hand-added here.
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" DROP CONSTRAINT "chk_admin_audit_log_subject_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" ADD CONSTRAINT "chk_admin_audit_log_subject_type" CHECK ("subject_type" IN ('USER', 'INVITE', 'REPORT', 'POST', 'JOB', 'DOMAIN'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" DROP CONSTRAINT "chk_admin_audit_log_subject_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" ADD CONSTRAINT "chk_admin_audit_log_subject_type" CHECK ("subject_type" IN ('USER', 'INVITE', 'REPORT', 'POST', 'JOB'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "ssh_login_challenges" DROP CONSTRAINT "chk_ssh_login_challenges_purpose"`,
    );
    await queryRunner.query(`ALTER TABLE "ssh_login_challenges" DROP COLUMN "bound_fingerprint"`);
    await queryRunner.query(`ALTER TABLE "ssh_login_challenges" DROP COLUMN "bound_user_id"`);
    await queryRunner.query(`ALTER TABLE "ssh_login_challenges" DROP COLUMN "purpose"`);
    await queryRunner.query(`ALTER TABLE "federation_keys" DROP COLUMN "private_key_tag"`);
    await queryRunner.query(`ALTER TABLE "federation_keys" DROP COLUMN "private_key_iv"`);
    await queryRunner.query(`ALTER TABLE "federation_keys" DROP COLUMN "private_key_ciphertext"`);
    await queryRunner.query(`ALTER TABLE "federation_keys" ADD "private_key_pem" text NOT NULL`);
  }
}
