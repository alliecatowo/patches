import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6 admin tooling (`INITIAL_VISION.md` §65–66, A-018): `admin_audit_log` (every
 * mutating `patches-admin` command writes one row here), `rate_limit_buckets` (the db-backed
 * half of rate limiting, A-018), and the operator-removal columns on `posts` that
 * `patches-admin post remove` needs (`removed_by_user_id`, `removal_reason`) — `deleted_at`
 * already existed for the author self-delete path.
 *
 * Generated with `pnpm db:generate --name=Phase6Admin` from the entities, then hand-edited in
 * exactly the one way `Phase1Schema`/`Phase4Interactions` already establish: `uuid_generate_v4()`
 * -> `gen_random_uuid()` on `admin_audit_log.id` — no `uuid-ossp` extension is ever installed.
 * Otherwise unchanged; `pnpm db:generate --name=Probe` against a migrated database reports no
 * further changes.
 */
export class Phase6Admin1787062075716 implements MigrationInterface {
  name = 'Phase6Admin1787062075716';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "admin_audit_log" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "admin_user_id" uuid NOT NULL, "action" text NOT NULL, "subject_type" text NOT NULL, "subject_id" text NOT NULL, "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_admin_audit_log_subject_type" CHECK ("subject_type" IN ('USER', 'INVITE', 'REPORT', 'POST', 'JOB')), CONSTRAINT "pk_admin_audit_log_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_admin_audit_log_subject_id_subject_type" ON "admin_audit_log"  ("subject_type", "subject_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_admin_audit_log_created_at" ON "admin_audit_log"  ("created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "rate_limit_buckets" ("key" text NOT NULL, "window_start" TIMESTAMP WITH TIME ZONE NOT NULL, "count" integer NOT NULL DEFAULT '0', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "pk_rate_limit_buckets_key_window_start" PRIMARY KEY ("key", "window_start"))`,
    );
    await queryRunner.query(`ALTER TABLE "posts" ADD "removed_by_user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "posts" ADD "removal_reason" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "removal_reason"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "removed_by_user_id"`);
    await queryRunner.query(`DROP TABLE "rate_limit_buckets"`);
    await queryRunner.query(`DROP INDEX "public"."idx_admin_audit_log_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_admin_audit_log_subject_id_subject_type"`);
    await queryRunner.query(`DROP TABLE "admin_audit_log"`);
  }
}
