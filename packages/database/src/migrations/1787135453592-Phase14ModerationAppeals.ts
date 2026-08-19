import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase14ModerationAppeals1787135453592 implements MigrationInterface {
  name = 'Phase14ModerationAppeals1787135453592';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "appeals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid NOT NULL, "admin_audit_log_id" uuid NOT NULL, "statement" text NOT NULL, "status" text NOT NULL DEFAULT 'OPEN', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resolved_at" TIMESTAMP WITH TIME ZONE, "resolved_by_user_id" uuid, "resolution_reason" text, CONSTRAINT "chk_appeals_status" CHECK ("status" IN ('OPEN', 'UPHELD', 'OVERTURNED', 'MODIFIED')), CONSTRAINT "pk_appeals_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_appeals_admin_audit_log_id" ON "appeals"  ("admin_audit_log_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "moderation_log_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "action" text NOT NULL, "subject_kind" text NOT NULL, "subject_domain" text, "reason_category" text NOT NULL, "appealed" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_moderation_log_entries_subject_domain" CHECK (("subject_kind" = 'DOMAIN' AND "subject_domain" IS NOT NULL) OR ("subject_kind" <> 'DOMAIN' AND "subject_domain" IS NULL)), CONSTRAINT "chk_moderation_log_entries_reason_category" CHECK ("reason_category" IN ('HARASSMENT', 'HATE', 'THREATS', 'DOXXING', 'IMPERSONATION', 'SPAM', 'ILLEGAL_CONTENT', 'NCII', 'INFRASTRUCTURE_ABUSE', 'OTHER')), CONSTRAINT "chk_moderation_log_entries_subject_kind" CHECK ("subject_kind" IN ('DOMAIN', 'ACCOUNT', 'POST', 'MEDIA')), CONSTRAINT "chk_moderation_log_entries_action" CHECK ("action" IN ('WARN', 'SUSPEND', 'BAN', 'POST_REMOVAL', 'MEDIA_TAKEDOWN', 'DOMAIN_BLOCK')), CONSTRAINT "pk_moderation_log_entries_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_moderation_log_entries_created_at_id" ON "moderation_log_entries"  ("created_at", "id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "domain_blocks" ADD "reason_category" text NOT NULL DEFAULT 'OTHER'`,
    );
    await queryRunner.query(
      `ALTER TABLE "domain_blocks" ADD "source" text NOT NULL DEFAULT 'MANUAL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "domain_blocks" ADD CONSTRAINT "chk_domain_blocks_source" CHECK ("source" IN ('MANUAL', 'IMPORTED'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "domain_blocks" ADD CONSTRAINT "chk_domain_blocks_reason_category" CHECK ("reason_category" IN ('HARASSMENT', 'HATE', 'THREATS', 'DOXXING', 'IMPERSONATION', 'SPAM', 'ILLEGAL_CONTENT', 'NCII', 'INFRASTRUCTURE_ABUSE', 'OTHER'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "appeals" ADD CONSTRAINT "fk_appeals_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appeals" ADD CONSTRAINT "fk_appeals_admin_audit_log_id" FOREIGN KEY ("admin_audit_log_id") REFERENCES "admin_audit_log"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appeals" ADD CONSTRAINT "fk_appeals_resolved_by_user_id" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appeals" DROP CONSTRAINT "fk_appeals_resolved_by_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appeals" DROP CONSTRAINT "fk_appeals_admin_audit_log_id"`,
    );
    await queryRunner.query(`ALTER TABLE "appeals" DROP CONSTRAINT "fk_appeals_actor_id"`);
    await queryRunner.query(
      `ALTER TABLE "domain_blocks" DROP CONSTRAINT "chk_domain_blocks_reason_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "domain_blocks" DROP CONSTRAINT "chk_domain_blocks_source"`,
    );
    await queryRunner.query(`ALTER TABLE "domain_blocks" DROP COLUMN "source"`);
    await queryRunner.query(`ALTER TABLE "domain_blocks" DROP COLUMN "reason_category"`);
    await queryRunner.query(`DROP INDEX "public"."idx_moderation_log_entries_created_at_id"`);
    await queryRunner.query(`DROP TABLE "moderation_log_entries"`);
    await queryRunner.query(`DROP INDEX "public"."idx_appeals_admin_audit_log_id"`);
    await queryRunner.query(`DROP TABLE "appeals"`);
  }
}
