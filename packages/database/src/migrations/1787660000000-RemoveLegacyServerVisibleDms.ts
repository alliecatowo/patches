import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * B-095 / ADR 0030 §"Application 1 — legacy server-visible DMs": removes the plaintext DM
 * machinery `LEGACY_SERVER_VISIBLE` conversations depended on. Pre-alpha, zero users — ADR
 * 0030's consolidation policy authorizes dropping the data outright rather than migrating it;
 * `E2EE_V1` is the only conversation security mode from here on (the protobuf enum value is
 * separately `reserved`, never reused — `patches/v1/e2ee.proto`).
 *
 * Order: delete the now-disallowed rows before narrowing each CHECK constraint to reject them,
 * so the constraint change itself never fails against leftover data.
 */
export class RemoveLegacyServerVisibleDms1787660000000 implements MigrationInterface {
  name = 'RemoveLegacyServerVisibleDms1787660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `reports.subject_type = 'MESSAGE'` evidence rows: the plaintext snapshot they carry only
    // makes sense for a `messages` row, which is about to be dropped. `E2EE_MESSAGE` (ADR 0020
    // §9) is the only message-report subject type left — it never snapshotted content anyway.
    await queryRunner.query(`DELETE FROM "reports" WHERE "subject_type" = 'MESSAGE'`);

    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_matches_type"`,
    );
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_type"`);
    await queryRunner.query(`DROP INDEX "public"."idx_reports_subject_message_id"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "message_snapshot"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "subject_message_id"`);
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_type" CHECK ("subject_type" IN ('ACTOR', 'POST', 'GUESTBOOK_ENTRY', 'E2EE_MESSAGE'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_matches_type" CHECK (("subject_type" = 'ACTOR' AND "subject_actor_id" IS NOT NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_e2ee_logical_message_id" IS NULL) OR ("subject_type" = 'POST' AND "subject_post_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_e2ee_logical_message_id" IS NULL) OR ("subject_type" = 'GUESTBOOK_ENTRY' AND "subject_guestbook_entry_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL AND "subject_e2ee_logical_message_id" IS NULL) OR ("subject_type" = 'E2EE_MESSAGE' AND "subject_e2ee_logical_message_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL))`,
    );

    // Every legacy conversation and its members — `messages`/`message_requests` are dropped
    // wholesale next regardless, but `conversations`/`conversation_members` survive for E2EE,
    // so the legacy rows need an explicit sweep rather than riding a table drop.
    await queryRunner.query(
      `DELETE FROM "conversations" WHERE "security_mode" = 'LEGACY_SERVER_VISIBLE'`,
    );

    await queryRunner.query(
      `ALTER TABLE "message_requests" DROP CONSTRAINT "fk_message_requests_recipient_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_requests" DROP CONSTRAINT "fk_message_requests_sender_actor_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_message_requests_client_request_id_sender_actor_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_message_requests_recipient_actor_id_sender_actor_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_message_requests_created_at_id_recipient_actor_id"`,
    );
    await queryRunner.query(`DROP TABLE "message_requests"`);

    await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "fk_messages_sender_actor_id"`);
    await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "fk_messages_conversation_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_messages_client_request_id_sender_actor_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_messages_conversation_id_created_at_id"`);
    await queryRunner.query(`DROP TABLE "messages"`);

    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT "chk_conversations_security_mode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ALTER COLUMN "security_mode" SET DEFAULT 'E2EE_V1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "chk_conversations_security_mode" CHECK ("security_mode" IN ('E2EE_V1'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Schema-only reversal (ADR 0030: pre-production, data is disposable) — restores the
    // `LEGACY_SERVER_VISIBLE`-capable shape without restoring any deleted rows.
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT "chk_conversations_security_mode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ALTER COLUMN "security_mode" SET DEFAULT 'LEGACY_SERVER_VISIBLE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "chk_conversations_security_mode" CHECK ("security_mode" IN ('LEGACY_SERVER_VISIBLE', 'E2EE_V1'))`,
    );

    await queryRunner.query(
      `CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "sender_actor_id" uuid, "body" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "client_request_id" uuid, CONSTRAINT "pk_messages_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_messages_conversation_id_created_at_id" ON "messages"  ("conversation_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_messages_client_request_id_sender_actor_id" ON "messages"  ("sender_actor_id", "client_request_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_sender_actor_id" FOREIGN KEY ("sender_actor_id") REFERENCES "actors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "message_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sender_actor_id" uuid NOT NULL, "recipient_actor_id" uuid NOT NULL, "body" text NOT NULL, "status" text NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "client_request_id" uuid, CONSTRAINT "chk_message_requests_status" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED')), CONSTRAINT "pk_message_requests_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_message_requests_created_at_id_recipient_actor_id" ON "message_requests"  ("recipient_actor_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_message_requests_recipient_actor_id_sender_actor_id" ON "message_requests"  ("sender_actor_id", "recipient_actor_id") WHERE "status" = 'PENDING'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_message_requests_client_request_id_sender_actor_id" ON "message_requests"  ("sender_actor_id", "client_request_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "message_requests" ADD CONSTRAINT "fk_message_requests_sender_actor_id" FOREIGN KEY ("sender_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_requests" ADD CONSTRAINT "fk_message_requests_recipient_actor_id" FOREIGN KEY ("recipient_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_matches_type"`,
    );
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_type"`);
    await queryRunner.query(`ALTER TABLE "reports" ADD "subject_message_id" uuid`);
    await queryRunner.query(`ALTER TABLE "reports" ADD "message_snapshot" jsonb`);
    await queryRunner.query(
      `CREATE INDEX "idx_reports_subject_message_id" ON "reports"  ("subject_message_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_type" CHECK ("subject_type" IN ('ACTOR', 'POST', 'GUESTBOOK_ENTRY', 'MESSAGE', 'E2EE_MESSAGE'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_matches_type" CHECK (("subject_type" = 'ACTOR' AND "subject_actor_id" IS NOT NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_message_id" IS NULL AND "subject_e2ee_logical_message_id" IS NULL) OR ("subject_type" = 'POST' AND "subject_post_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_message_id" IS NULL AND "subject_e2ee_logical_message_id" IS NULL) OR ("subject_type" = 'GUESTBOOK_ENTRY' AND "subject_guestbook_entry_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL AND "subject_message_id" IS NULL AND "subject_e2ee_logical_message_id" IS NULL) OR ("subject_type" = 'MESSAGE' AND "subject_message_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_e2ee_logical_message_id" IS NULL) OR ("subject_type" = 'E2EE_MESSAGE' AND "subject_e2ee_logical_message_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_message_id" IS NULL))`,
    );
  }
}
