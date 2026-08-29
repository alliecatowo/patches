import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #270: drops `e2ee_conversation_membership_events` — the second, root-key-signed
 * GENESIS/ADD/REMOVE membership chain from P13-008 (`1787241965646-Phase13GroupMembership.ts`)
 * — because nothing ever constructed, persisted, or read it outside its own test. The shipped
 * membership protocol is the device-key-signed `E2eeGroupControlEvent` chain in `groups.ts` /
 * `group-control.service.ts`, unaffected by this migration.
 *
 * `conversations.membership_epoch` (added by the same P13-008 migration) is left in place:
 * it is a denormalized column read/written independently of this table by the shipped fanout
 * path, out of this issue's scope.
 */
export class DropE2eeConversationMembershipEvents1787815392235 implements MigrationInterface {
  name = 'DropE2eeConversationMembershipEvents1787815392235';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "e2ee_conversation_membership_events" DROP CONSTRAINT "fk_e2ee_conversation_membership_events_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_conversation_membership_events" DROP CONSTRAINT "fk_e2ee_conversation_membership_events_conversation_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_conversation_membership_events_conversation_id_epoch"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_conversation_membership_events_digest"`);
    await queryRunner.query(`DROP TABLE "e2ee_conversation_membership_events"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
      `ALTER TABLE "e2ee_conversation_membership_events" ADD CONSTRAINT "fk_e2ee_conversation_membership_events_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_conversation_membership_events" ADD CONSTRAINT "fk_e2ee_conversation_membership_events_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
