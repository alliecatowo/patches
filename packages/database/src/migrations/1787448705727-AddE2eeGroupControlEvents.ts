import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddE2eeGroupControlEvents1787448705727 implements MigrationInterface {
  name = 'AddE2eeGroupControlEvents1787448705727';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "e2ee_group_control_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "epoch" bigint NOT NULL, "change_kind" text NOT NULL, "subject_actor_id" uuid NOT NULL, "signer_actor_id" uuid NOT NULL, "signer_device_id" uuid NOT NULL, "previous_digest" bytea NOT NULL, "digest" bytea NOT NULL, "event_bytes" bytea NOT NULL, "device_signature" bytea NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_e2ee_group_control_events_change" CHECK ("change_kind" IN ('ADDED', 'REMOVED')), CONSTRAINT "chk_e2ee_group_control_events_digest_lengths" CHECK (octet_length("previous_digest") = 32 AND octet_length("digest") = 32), CONSTRAINT "chk_e2ee_group_control_events_epoch" CHECK ("epoch" >= 2), CONSTRAINT "pk_e2ee_group_control_events_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_group_control_events_conversation_id_epoch" ON "e2ee_group_control_events"  ("conversation_id", "epoch") `,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_group_control_events" ADD CONSTRAINT "fk_e2ee_group_control_events_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "e2ee_group_control_events" DROP CONSTRAINT "fk_e2ee_group_control_events_conversation_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_group_control_events_conversation_id_epoch"`,
    );
    await queryRunner.query(`DROP TABLE "e2ee_group_control_events"`);
  }
}
