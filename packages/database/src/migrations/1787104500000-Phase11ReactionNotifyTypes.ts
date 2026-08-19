import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `chk_notifications_type` to add `'REPOST'`/`'QUOTE'` (`INITIAL_VISION.md` §187,
 * P11-006) — hand-added, not `pnpm db:generate`-produced: `migration:generate`'s diff does
 * not compare existing `@Check()` constraint bodies on an unchanged column
 * (`docs/agents/LEARNINGS.md`), same reasoning `Phase9Hardening`'s `chk_admin_audit_log_
 * subject_type` widening documents. The full value list here matches
 * `packages/database/src/entities/enums.ts`'s `NOTIFICATION_TYPES` as of this migration —
 * including `'MESSAGE'` (P11-004), landed on this branch ahead of this migration.
 */
export class Phase11ReactionNotifyTypes1787104500000 implements MigrationInterface {
  name = 'Phase11ReactionNotifyTypes1787104500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "chk_notifications_type"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "chk_notifications_type" CHECK ("type" IN ('FOLLOW', 'LIKE', 'REPLY', 'MENTION', 'MODERATION', 'MESSAGE', 'REPOST', 'QUOTE', 'COMMUNITY_INVITE'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "chk_notifications_type"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "chk_notifications_type" CHECK ("type" IN ('FOLLOW', 'LIKE', 'REPLY', 'MENTION', 'MODERATION'))`,
    );
  }
}
