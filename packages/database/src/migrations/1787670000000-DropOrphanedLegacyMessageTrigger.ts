import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * B-136(f): `MessagesRequireLegacySecurityMode1787530000000` (the migration that created
 * `patches_reject_message_in_nonlegacy_conversation()`) was deleted from the repo before it
 * ever shipped in this branch's history, but any dev/preview database that had already run it
 * still has the function sitting around — `RemoveLegacyServerVisibleDms1787660000000`'s
 * `DROP TABLE "messages"` took the trigger down as a dependent object, but a function isn't
 * owned by the table it triggers on, so it orphaned rather than dropping automatically.
 *
 * This is a NEW migration rather than editing `RemoveLegacyServerVisibleDms1787660000000` in
 * place: that migration is already applied against real (pre-alpha but shared) databases, and
 * editing an applied migration's `up()` after the fact means already-migrated databases silently
 * diverge from what the file on disk claims ran. `IF EXISTS` makes this safe to run against a
 * database that never had the orphan migration at all (including every fresh test database).
 */
export class DropOrphanedLegacyMessageTrigger1787670000000 implements MigrationInterface {
  name = 'DropOrphanedLegacyMessageTrigger1787670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "patches_reject_message_in_nonlegacy_conversation"()`,
    );
  }

  public async down(): Promise<void> {
    // Deliberately not restored: the function's only caller was the `messages` table, which
    // `RemoveLegacyServerVisibleDms1787660000000` already dropped for good (ADR 0030's
    // pre-alpha consolidation policy) — there is nothing left for this function to guard.
  }
}
