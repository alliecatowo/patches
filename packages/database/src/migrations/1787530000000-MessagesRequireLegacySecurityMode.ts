import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Audit P0-1(b) — belt-and-braces backstop for ADR 0020 §1's mode separation: a `messages`
 * row is plaintext by definition (the node can read it, spec §183.1), so it may only ever be
 * written into a `LEGACY_SERVER_VISIBLE` conversation. The application services gate this
 * (`MessagesService.sendMessage` and the mode-aware direct-thread reuse), but a trigger is
 * the hard last line: no future code path — or raw query — can silently plant a
 * server-readable body inside an `E2EE_V1` transcript.
 *
 * Same conventions as Phase13E2ee's immutability trigger: the violation surfaces with SQLSTATE
 * `check_violation` (`23514`) like any CHECK constraint failure, and `CREATE OR REPLACE`
 * rather than bare `CREATE` because TypeORM's `dropDatabase()` drops tables but leaves
 * functions behind, which would break the second migration run against the same test database.
 */
export class MessagesRequireLegacySecurityMode1787530000000 implements MigrationInterface {
  name = 'MessagesRequireLegacySecurityMode1787530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "patches_reject_message_in_nonlegacy_conversation"() RETURNS trigger AS $$
      DECLARE
        conversation_mode text;
      BEGIN
        SELECT c."security_mode" INTO conversation_mode
        FROM "conversations" c WHERE c."id" = NEW."conversation_id";
        IF conversation_mode IS DISTINCT FROM 'LEGACY_SERVER_VISIBLE' THEN
          RAISE EXCEPTION 'messages rows are restricted to LEGACY_SERVER_VISIBLE conversations'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(
      `CREATE TRIGGER "trg_messages_require_legacy_security_mode" BEFORE INSERT ON "messages" FOR EACH ROW EXECUTE FUNCTION "patches_reject_message_in_nonlegacy_conversation"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "trg_messages_require_legacy_security_mode" ON "messages"`,
    );
    await queryRunner.query(`DROP FUNCTION "patches_reject_message_in_nonlegacy_conversation"()`);
  }
}
