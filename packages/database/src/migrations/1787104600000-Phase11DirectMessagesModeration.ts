import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase11DirectMessagesModeration1787104600000 implements MigrationInterface {
  name = 'Phase11DirectMessagesModeration1787104600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "messages" ADD "client_request_id" uuid`);
    await queryRunner.query(`ALTER TABLE "message_requests" ADD "client_request_id" uuid`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD "conversation_id" uuid`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD "community_id" uuid`);
    await queryRunner.query(`ALTER TABLE "reports" ADD "subject_message_id" uuid`);
    await queryRunner.query(`ALTER TABLE "reports" ADD "message_snapshot" jsonb`);
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_type"`);
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_type" CHECK ("subject_type" IN ('ACTOR', 'POST', 'GUESTBOOK_ENTRY', 'MESSAGE'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_matches_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_matches_type" CHECK (("subject_type" = 'ACTOR' AND "subject_actor_id" IS NOT NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_message_id" IS NULL) OR ("subject_type" = 'POST' AND "subject_post_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_message_id" IS NULL) OR ("subject_type" = 'GUESTBOOK_ENTRY' AND "subject_guestbook_entry_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL AND "subject_message_id" IS NULL) OR ("subject_type" = 'MESSAGE' AND "subject_message_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" DROP CONSTRAINT "chk_admin_audit_log_subject_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" ADD CONSTRAINT "chk_admin_audit_log_subject_type" CHECK ("subject_type" IN ('USER', 'INVITE', 'REPORT', 'POST', 'JOB', 'DOMAIN', 'COMMUNITY'))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_messages_client_request_id_sender_actor_id" ON "messages"  ("sender_actor_id", "client_request_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_message_requests_client_request_id_sender_actor_id" ON "message_requests"  ("sender_actor_id", "client_request_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_notifications_conversation_id_recipient_actor_id_type" ON "notifications" ("recipient_actor_id", "type", "conversation_id") WHERE "conversation_id" IS NOT NULL AND "read_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_community_id" ON "notifications" ("community_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reports_subject_message_id" ON "reports"  ("subject_message_id") `,
    );
    // `migration:generate` does not diff a partial index's WHERE clause on an otherwise
    // unchanged column set (see docs/agents/LEARNINGS.md's `typeorm-generate-missing-
    // check-diff` entry, same gap applied to a partial unique index instead of a CHECK) —
    // hand-added: narrows this index so it keeps meaning "FOLLOW/MODERATION" now that
    // MESSAGE rows also have `post_id IS NULL` (see `notification.entity.ts`).
    await queryRunner.query(
      `DROP INDEX "public"."idx_notifications_actor_id_recipient_actor_id_type"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_notifications_actor_id_recipient_actor_id_type" ON "notifications"  ("recipient_actor_id", "type", "actor_id") WHERE "post_id" IS NULL AND "conversation_id" IS NULL AND "community_id" IS NULL AND "type" <> 'MESSAGE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_community_id" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "fk_notifications_community_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "fk_notifications_conversation_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_notifications_actor_id_recipient_actor_id_type"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_notifications_actor_id_recipient_actor_id_type" ON "notifications"  ("recipient_actor_id", "type", "actor_id") WHERE "post_id" IS NULL`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_reports_subject_message_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_notifications_community_id"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_notifications_conversation_id_recipient_actor_id_type"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_message_requests_client_request_id_sender_actor_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_messages_client_request_id_sender_actor_id"`);
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" DROP CONSTRAINT "chk_admin_audit_log_subject_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" ADD CONSTRAINT "chk_admin_audit_log_subject_type" CHECK ("subject_type" IN ('USER', 'INVITE', 'REPORT', 'POST', 'JOB', 'DOMAIN'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_matches_type"`,
    );
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_type"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "message_snapshot"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "subject_message_id"`);
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_type" CHECK ("subject_type" IN ('ACTOR', 'POST', 'GUESTBOOK_ENTRY'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_matches_type" CHECK (("subject_type" = 'ACTOR' AND "subject_actor_id" IS NOT NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL) OR ("subject_type" = 'POST' AND "subject_post_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_guestbook_entry_id" IS NULL) OR ("subject_type" = 'GUESTBOOK_ENTRY' AND "subject_guestbook_entry_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL))`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "community_id"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "conversation_id"`);
    await queryRunner.query(`ALTER TABLE "message_requests" DROP COLUMN "client_request_id"`);
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "client_request_id"`);
  }
}
