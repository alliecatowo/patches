import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P13-008 (ADR 0020 §7, ADR 0026): `e2ee_conversation_membership_events` — the authenticated,
 * root-signed group membership epoch chain — and `conversations.membership_epoch`, the
 * denormalized current-epoch column `e2ee-fanout.ts`/`e2ee-membership.ts` lock together to
 * serialize a fanout accept against a concurrent membership change (see those modules' doc
 * comments for the race this resolves).
 *
 * The unrelated `filter_list_subscriptions.scopes` default-array ordering diff `db:generate`
 * also produced here was stripped — same benign diff `1787220000000-AddOidcCredentialType.ts`'s
 * and `1787235748738-Phase13NodeFrankingKeys.ts`'s doc comments already document, not a real
 * schema change.
 */
export class Phase13GroupMembership1787241965646 implements MigrationInterface {
  name = 'Phase13GroupMembership1787241965646';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "e2ee_conversation_membership_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "epoch" bigint NOT NULL, "previous_digest" bytea NOT NULL, "digest" bytea NOT NULL, "event_bytes" bytea NOT NULL, "action" text NOT NULL, "actor_id" uuid NOT NULL, "target_actor_id" uuid, "member_actor_ids" text array NOT NULL, "root_generation" integer, "root_signature" bytea, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_e2ee_membership_events_signature" CHECK (("action" = 'GENESIS' AND "root_signature" IS NULL AND "root_generation" IS NULL AND "target_actor_id" IS NULL) OR ("action" != 'GENESIS' AND octet_length("root_signature") = 64 AND "root_generation" IS NOT NULL AND "target_actor_id" IS NOT NULL)), CONSTRAINT "chk_e2ee_membership_events_digest_lengths" CHECK (octet_length("previous_digest") = 32 AND octet_length("digest") = 32), CONSTRAINT "chk_e2ee_membership_events_epoch" CHECK ("epoch" > 0), CONSTRAINT "chk_e2ee_membership_events_action" CHECK ("action" IN ('GENESIS', 'ADD', 'REMOVE')), CONSTRAINT "pk_e2ee_conversation_membership_events_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_conversation_membership_events_digest" ON "e2ee_conversation_membership_events" ("digest")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_conversation_membership_events_conversation_id_epoch" ON "e2ee_conversation_membership_events" ("conversation_id", "epoch")`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD "membership_epoch" bigint NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_conversation_membership_events" ADD CONSTRAINT "fk_e2ee_conversation_membership_events_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_conversation_membership_events" ADD CONSTRAINT "fk_e2ee_conversation_membership_events_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "e2ee_conversation_membership_events" DROP CONSTRAINT "fk_e2ee_conversation_membership_events_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_conversation_membership_events" DROP CONSTRAINT "fk_e2ee_conversation_membership_events_conversation_id"`,
    );
    await queryRunner.query(`ALTER TABLE "conversations" DROP COLUMN "membership_epoch"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_conversation_membership_events_conversation_id_epoch"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_conversation_membership_events_digest"`);
    await queryRunner.query(`DROP TABLE "e2ee_conversation_membership_events"`);
  }
}
