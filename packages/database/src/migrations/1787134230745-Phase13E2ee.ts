import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase13E2ee1787134230745 implements MigrationInterface {
  name = 'Phase13E2ee1787134230745';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "e2ee_identity_roots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid NOT NULL, "generation" integer NOT NULL, "public_key" bytea NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "rotated_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_e2ee_identity_roots_generation" CHECK ("generation" > 0), CONSTRAINT "chk_e2ee_identity_roots_key_length" CHECK (octet_length("public_key") = 32), CONSTRAINT "pk_e2ee_identity_roots_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_identity_roots_actor_id" ON "e2ee_identity_roots"  ("actor_id") WHERE "rotated_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_identity_roots_actor_id_generation" ON "e2ee_identity_roots"  ("actor_id", "generation") `,
    );
    await queryRunner.query(
      `CREATE TABLE "e2ee_device_identities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid NOT NULL, "identity_root_id" uuid NOT NULL, "device_id" uuid NOT NULL, "generation" integer NOT NULL, "signing_public_key" bytea NOT NULL, "agreement_public_key" bytea NOT NULL, "certificate_bytes" bytea NOT NULL, "root_signature" bytea NOT NULL, "certificate_created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "registered_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_e2ee_device_identities_validity" CHECK ("expires_at" > "certificate_created_at"), CONSTRAINT "chk_e2ee_device_identities_generation" CHECK ("generation" > 0), CONSTRAINT "chk_e2ee_device_identities_signature_length" CHECK (octet_length("root_signature") = 64), CONSTRAINT "chk_e2ee_device_identities_key_lengths" CHECK (octet_length("signing_public_key") = 32 AND octet_length("agreement_public_key") = 32), CONSTRAINT "pk_e2ee_device_identities_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_device_identities_actor_id_device_id" ON "e2ee_device_identities"  ("actor_id", "device_id") WHERE "revoked_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_e2ee_device_identities_actor_id_revoked_at" ON "e2ee_device_identities"  ("actor_id", "revoked_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_device_identities_actor_id_device_id_generation" ON "e2ee_device_identities"  ("actor_id", "device_id", "generation") `,
    );
    await queryRunner.query(
      `CREATE TABLE "e2ee_device_rosters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid NOT NULL, "sequence" bigint NOT NULL, "previous_digest" bytea NOT NULL, "digest" bytea NOT NULL, "roster_bytes" bytea NOT NULL, "root_signature" bytea NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_e2ee_device_rosters_sequence" CHECK ("sequence" > 0), CONSTRAINT "chk_e2ee_device_rosters_signature_length" CHECK (octet_length("root_signature") = 64), CONSTRAINT "chk_e2ee_device_rosters_digest_lengths" CHECK (octet_length("previous_digest") = 32 AND octet_length("digest") = 32), CONSTRAINT "pk_e2ee_device_rosters_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_device_rosters_digest" ON "e2ee_device_rosters"  ("digest") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_device_rosters_actor_id_sequence" ON "e2ee_device_rosters"  ("actor_id", "sequence") `,
    );
    await queryRunner.query(
      `CREATE TABLE "e2ee_logical_messages" ("id" uuid NOT NULL, "conversation_id" uuid NOT NULL, "epoch" bigint NOT NULL, "sender_actor_id" uuid NOT NULL, "sender_device_id" uuid NOT NULL, "client_request_id" uuid NOT NULL, "fanout_digest" bytea NOT NULL, "franking_commitment" bytea NOT NULL, "franking_profile" text NOT NULL, "franking_key_era" integer NOT NULL, "franking_tag" bytea NOT NULL, "accepted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_e2ee_logical_messages_franking_era" CHECK ("franking_key_era" > 0), CONSTRAINT "chk_e2ee_logical_messages_epoch" CHECK ("epoch" > 0), CONSTRAINT "chk_e2ee_logical_messages_digest_lengths" CHECK (octet_length("fanout_digest") = 32 AND octet_length("franking_commitment") = 32), CONSTRAINT "pk_e2ee_logical_messages_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_logical_messages_client_request_id_sender_actor_id" ON "e2ee_logical_messages"  ("sender_actor_id", "client_request_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_e2ee_logical_messages_accepted_at_conversation_id_id" ON "e2ee_logical_messages"  ("conversation_id", "accepted_at", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "e2ee_mailbox_envelopes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "logical_message_id" uuid NOT NULL, "recipient_device_identity_id" uuid NOT NULL, "encrypted_header" bytea NOT NULL, "ciphertext" bytea NOT NULL, "opening_ciphertext" bytea NOT NULL, "ciphertext_digest" bytea NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "acknowledged_at" TIMESTAMP WITH TIME ZONE, "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_e2ee_mailbox_envelopes_size" CHECK (octet_length("encrypted_header") + octet_length("ciphertext") + octet_length("opening_ciphertext") <= 65536), CONSTRAINT "chk_e2ee_mailbox_envelopes_digest_length" CHECK (octet_length("ciphertext_digest") = 32), CONSTRAINT "pk_e2ee_mailbox_envelopes_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_e2ee_mailbox_envelopes_id_received_at_recipient_device_iden" ON "e2ee_mailbox_envelopes"  ("recipient_device_identity_id", "received_at", "id") WHERE "acknowledged_at" IS NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_mailbox_envelopes_logical_message_id_recipient_device_" ON "e2ee_mailbox_envelopes"  ("logical_message_id", "recipient_device_identity_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "e2ee_one_time_prekeys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "device_identity_id" uuid NOT NULL, "key_id" bigint NOT NULL, "public_key" bytea NOT NULL, "uploaded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "consumed_at" TIMESTAMP WITH TIME ZONE, "consumed_by_logical_message_id" uuid, CONSTRAINT "chk_e2ee_one_time_prekeys_key_id" CHECK ("key_id" > 0), CONSTRAINT "chk_e2ee_one_time_prekeys_public_key_length" CHECK (octet_length("public_key") = 32), CONSTRAINT "pk_e2ee_one_time_prekeys_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_e2ee_one_time_prekeys_device_identity_id_id" ON "e2ee_one_time_prekeys"  ("device_identity_id", "id") WHERE "consumed_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_e2ee_one_time_prekeys_consumed_at_device_identity_id_id" ON "e2ee_one_time_prekeys"  ("device_identity_id", "consumed_at", "id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_one_time_prekeys_device_identity_id_key_id" ON "e2ee_one_time_prekeys"  ("device_identity_id", "key_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "e2ee_report_evidence" ("report_id" uuid NOT NULL, "verification_status" text NOT NULL DEFAULT 'PENDING', "consented_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "verified_at" TIMESTAMP WITH TIME ZONE, "verification_failure_code" text, CONSTRAINT "chk_e2ee_report_evidence_status" CHECK ("verification_status" IN ('PENDING', 'VERIFIED', 'UNVERIFIABLE')), CONSTRAINT "pk_e2ee_report_evidence_report_id" PRIMARY KEY ("report_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "e2ee_report_evidence_items" ("report_id" uuid NOT NULL, "position" smallint NOT NULL, "logical_message_id" uuid NOT NULL, "disclosed_plaintext" bytea NOT NULL, "opening" bytea NOT NULL, "envelope_transcript" bytea NOT NULL, "franking_tag" bytea NOT NULL, "participant_transcript" bytea NOT NULL, "roster_digest" bytea NOT NULL, CONSTRAINT "chk_e2ee_report_evidence_items_digest_length" CHECK (octet_length("roster_digest") = 32), CONSTRAINT "chk_e2ee_report_evidence_items_sizes" CHECK (octet_length("disclosed_plaintext") <= 8192 AND octet_length("opening") <= 4096 AND octet_length("envelope_transcript") <= 65536), CONSTRAINT "chk_e2ee_report_evidence_items_position" CHECK ("position" >= 0 AND "position" <= 10), CONSTRAINT "pk_e2ee_report_evidence_items_position_report_id" PRIMARY KEY ("report_id", "position"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_report_evidence_items_logical_message_id_report_id" ON "e2ee_report_evidence_items"  ("report_id", "logical_message_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "e2ee_signed_prekeys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "device_identity_id" uuid NOT NULL, "key_id" bigint NOT NULL, "public_key" bytea NOT NULL, "signature" bytea NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "retired_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_e2ee_signed_prekeys_validity" CHECK ("expires_at" > "created_at"), CONSTRAINT "chk_e2ee_signed_prekeys_key_id" CHECK ("key_id" > 0), CONSTRAINT "chk_e2ee_signed_prekeys_signature_length" CHECK (octet_length("signature") = 64), CONSTRAINT "chk_e2ee_signed_prekeys_public_key_length" CHECK (octet_length("public_key") = 32), CONSTRAINT "pk_e2ee_signed_prekeys_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_signed_prekeys_device_identity_id" ON "e2ee_signed_prekeys"  ("device_identity_id") WHERE "retired_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_e2ee_signed_prekeys_device_identity_id_expires_at" ON "e2ee_signed_prekeys"  ("device_identity_id", "expires_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_signed_prekeys_device_identity_id_key_id" ON "e2ee_signed_prekeys"  ("device_identity_id", "key_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD "security_mode" text NOT NULL DEFAULT 'LEGACY_SERVER_VISIBLE'`,
    );
    await queryRunner.query(`ALTER TABLE "reports" ADD "subject_e2ee_logical_message_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "idx_reports_subject_e2ee_logical_message_id" ON "reports"  ("subject_e2ee_logical_message_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "chk_conversations_security_mode" CHECK ("security_mode" IN ('LEGACY_SERVER_VISIBLE', 'E2EE_V1'))`,
    );
    // `migration:generate` doesn't diff existing @Check() bodies on unchanged tables/columns
    // (see docs/agents/LEARNINGS.md), so the widened `reports` subject-type/subject-matches
    // constraints below are hand-written, not generated.
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_type"`);
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_type" CHECK ("subject_type" IN ('ACTOR', 'POST', 'GUESTBOOK_ENTRY', 'MESSAGE', 'E2EE_MESSAGE'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_matches_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_matches_type" CHECK (("subject_type" = 'ACTOR' AND "subject_actor_id" IS NOT NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_message_id" IS NULL AND "subject_e2ee_logical_message_id" IS NULL) OR ("subject_type" = 'POST' AND "subject_post_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_message_id" IS NULL AND "subject_e2ee_logical_message_id" IS NULL) OR ("subject_type" = 'GUESTBOOK_ENTRY' AND "subject_guestbook_entry_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL AND "subject_message_id" IS NULL AND "subject_e2ee_logical_message_id" IS NULL) OR ("subject_type" = 'MESSAGE' AND "subject_message_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_e2ee_logical_message_id" IS NULL) OR ("subject_type" = 'E2EE_MESSAGE' AND "subject_e2ee_logical_message_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_message_id" IS NULL))`,
    );
    // Conversation security mode is immutable after insert (ADR 0020 §1.1) — enforced at the
    // application layer too, but a trigger is the hard backstop since a row can never be
    // legitimately reinterpreted between LEGACY_SERVER_VISIBLE and E2EE_V1.
    //
    // `CREATE OR REPLACE`, not bare `CREATE`: functions aren't owned by any table, so
    // TypeORM's `dataSource.dropDatabase()` (`DROP TABLE ... CASCADE` + enum cleanup only,
    // see `clearDatabase()` in the Postgres driver) drops the trigger along with
    // "conversations" but leaves this function behind — a bare `CREATE FUNCTION` would then
    // fail with "already exists" on the second migration run against the same test database.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "patches_reject_conversation_mode_change"() RETURNS trigger AS $$
      BEGIN
        IF NEW."security_mode" IS DISTINCT FROM OLD."security_mode" THEN
          RAISE EXCEPTION 'conversation security mode is immutable' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(
      `CREATE TRIGGER "trg_conversations_immutable_security_mode" BEFORE UPDATE OF "security_mode" ON "conversations" FOR EACH ROW EXECUTE FUNCTION "patches_reject_conversation_mode_change"()`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" ADD CONSTRAINT "fk_e2ee_identity_roots_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_device_identities" ADD CONSTRAINT "fk_e2ee_device_identities_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_device_identities" ADD CONSTRAINT "fk_e2ee_device_identities_identity_root_id" FOREIGN KEY ("identity_root_id") REFERENCES "e2ee_identity_roots"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_device_rosters" ADD CONSTRAINT "fk_e2ee_device_rosters_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_logical_messages" ADD CONSTRAINT "fk_e2ee_logical_messages_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_mailbox_envelopes" ADD CONSTRAINT "fk_e2ee_mailbox_envelopes_logical_message_id" FOREIGN KEY ("logical_message_id") REFERENCES "e2ee_logical_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_mailbox_envelopes" ADD CONSTRAINT "fk_e2ee_mailbox_envelopes_recipient_device_identity_id" FOREIGN KEY ("recipient_device_identity_id") REFERENCES "e2ee_device_identities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_one_time_prekeys" ADD CONSTRAINT "fk_e2ee_one_time_prekeys_device_identity_id" FOREIGN KEY ("device_identity_id") REFERENCES "e2ee_device_identities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_report_evidence" ADD CONSTRAINT "fk_e2ee_report_evidence_report_id" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_report_evidence_items" ADD CONSTRAINT "fk_e2ee_report_evidence_items_report_id" FOREIGN KEY ("report_id") REFERENCES "e2ee_report_evidence"("report_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_signed_prekeys" ADD CONSTRAINT "fk_e2ee_signed_prekeys_device_identity_id" FOREIGN KEY ("device_identity_id") REFERENCES "e2ee_device_identities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "trg_conversations_immutable_security_mode" ON "conversations"`,
    );
    await queryRunner.query(`DROP FUNCTION "patches_reject_conversation_mode_change"()`);
    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_matches_type"`,
    );
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_type"`);
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_type" CHECK ("subject_type" IN ('ACTOR', 'POST', 'GUESTBOOK_ENTRY', 'MESSAGE'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_matches_type" CHECK (("subject_type" = 'ACTOR' AND "subject_actor_id" IS NOT NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_message_id" IS NULL) OR ("subject_type" = 'POST' AND "subject_post_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_guestbook_entry_id" IS NULL AND "subject_message_id" IS NULL) OR ("subject_type" = 'GUESTBOOK_ENTRY' AND "subject_guestbook_entry_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL AND "subject_message_id" IS NULL) OR ("subject_type" = 'MESSAGE' AND "subject_message_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_signed_prekeys" DROP CONSTRAINT "fk_e2ee_signed_prekeys_device_identity_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_report_evidence_items" DROP CONSTRAINT "fk_e2ee_report_evidence_items_report_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_report_evidence" DROP CONSTRAINT "fk_e2ee_report_evidence_report_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_one_time_prekeys" DROP CONSTRAINT "fk_e2ee_one_time_prekeys_device_identity_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_mailbox_envelopes" DROP CONSTRAINT "fk_e2ee_mailbox_envelopes_recipient_device_identity_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_mailbox_envelopes" DROP CONSTRAINT "fk_e2ee_mailbox_envelopes_logical_message_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_logical_messages" DROP CONSTRAINT "fk_e2ee_logical_messages_conversation_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_device_rosters" DROP CONSTRAINT "fk_e2ee_device_rosters_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_device_identities" DROP CONSTRAINT "fk_e2ee_device_identities_identity_root_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_device_identities" DROP CONSTRAINT "fk_e2ee_device_identities_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" DROP CONSTRAINT "fk_e2ee_identity_roots_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT "chk_conversations_security_mode"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_reports_subject_e2ee_logical_message_id"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "subject_e2ee_logical_message_id"`);
    await queryRunner.query(`ALTER TABLE "conversations" DROP COLUMN "security_mode"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_signed_prekeys_device_identity_id_key_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_signed_prekeys_device_identity_id_expires_at"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_signed_prekeys_device_identity_id"`);
    await queryRunner.query(`DROP TABLE "e2ee_signed_prekeys"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_report_evidence_items_logical_message_id_report_id"`,
    );
    await queryRunner.query(`DROP TABLE "e2ee_report_evidence_items"`);
    await queryRunner.query(`DROP TABLE "e2ee_report_evidence"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_one_time_prekeys_device_identity_id_key_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_one_time_prekeys_consumed_at_device_identity_id_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_one_time_prekeys_device_identity_id_id"`,
    );
    await queryRunner.query(`DROP TABLE "e2ee_one_time_prekeys"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_mailbox_envelopes_logical_message_id_recipient_device_"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_mailbox_envelopes_id_received_at_recipient_device_iden"`,
    );
    await queryRunner.query(`DROP TABLE "e2ee_mailbox_envelopes"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_logical_messages_accepted_at_conversation_id_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_logical_messages_client_request_id_sender_actor_id"`,
    );
    await queryRunner.query(`DROP TABLE "e2ee_logical_messages"`);
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_device_rosters_actor_id_sequence"`);
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_device_rosters_digest"`);
    await queryRunner.query(`DROP TABLE "e2ee_device_rosters"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_device_identities_actor_id_device_id_generation"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_device_identities_actor_id_revoked_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_device_identities_actor_id_device_id"`);
    await queryRunner.query(`DROP TABLE "e2ee_device_identities"`);
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_identity_roots_actor_id_generation"`);
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_identity_roots_actor_id"`);
    await queryRunner.query(`DROP TABLE "e2ee_identity_roots"`);
  }
}
