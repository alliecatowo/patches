import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR 0035 §4/§7: `CreateE2eeConversation` becomes a reservation with its own idempotency
 * anchor (`e2ee_logical_messages`' `(sender_actor_id, client_request_id)` anchor doesn't cover
 * it — a reservation writes no logical message), and `last_message_at` becomes nullable so a
 * reserved-but-unmessaged conversation can be distinguished from a real one and hidden (ADR
 * 0035 §5).
 */
export class ReserveE2eeConversationSchema1787792202409 implements MigrationInterface {
  name = 'ReserveE2eeConversationSchema1787792202409';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conversations" ADD "creation_client_request_id" text`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_conversations_creator_client_request_id" ON "conversations" ("created_by_actor_id", "creation_client_request_id") WHERE "creation_client_request_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ALTER COLUMN "last_message_at" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // These rows cannot exist under the previous (last_message_at NOT NULL) schema and carry
    // no messages by definition — safe to delete rather than backfill.
    await queryRunner.query(
      `DELETE FROM "conversation_members" WHERE "conversation_id" IN (SELECT "id" FROM "conversations" WHERE "last_message_at" IS NULL)`,
    );
    await queryRunner.query(`DELETE FROM "conversations" WHERE "last_message_at" IS NULL`);
    await queryRunner.query(
      `ALTER TABLE "conversations" ALTER COLUMN "last_message_at" SET NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX "public"."uq_conversations_creator_client_request_id"`);
    await queryRunner.query(`ALTER TABLE "conversations" DROP COLUMN "creation_client_request_id"`);
  }
}
