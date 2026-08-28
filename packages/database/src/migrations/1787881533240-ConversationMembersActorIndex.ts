import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #169: `MessagesService.listConversations` filters `conversation_members` on
 * `actor_id = X AND left_at IS NULL` — the composite PK leads with `conversation_id`, so that
 * predicate degraded to a full table scan. This index lets Postgres find "every conversation
 * membership for actor X" directly; `conversation_id` trails purely so the same index scan
 * can also cover `member.conversation`'s FK column.
 *
 * `db:generate` also proposed dropping `posts.tsv`, renaming an `e2ee_signed_prekeys` index,
 * and altering `rate_limit_buckets`'s primary key — pre-existing drift between those entities
 * and the schema already checked into the local test database, unrelated to this change. Only
 * the `conversation_members` index below was hand-picked out of that diff.
 */
export class ConversationMembersActorIndex1787881533240 implements MigrationInterface {
  name = 'ConversationMembersActorIndex1787881533240';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_conversation_members_actor_id_conversation_id_left_at" ON "conversation_members" ("actor_id", "left_at", "conversation_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_conversation_members_actor_id_conversation_id_left_at"`,
    );
  }
}
