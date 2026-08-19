import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 15 follow-up: recovery codes (P15-003, `INITIAL_VISION.md` §165).
 *
 * Widens `chk_credentials_type` to add `'RECOVERY_CODE'` and `chk_notifications_type` to add
 * `'SECURITY'` — both hand-added rather than `pnpm db:generate`-produced, since
 * `migration:generate`'s diff does not compare an existing `@Check()` body on an unchanged
 * table/column (see `1787104500000-Phase11ReactionNotifyTypes.ts`'s own doc comment for the
 * same caveat). The full value lists here match `packages/database/src/entities/enums.ts`'s
 * `CREDENTIAL_TYPES`/`NOTIFICATION_TYPES` as of this migration.
 */
export class Phase15AuthPolicy1787170000000 implements MigrationInterface {
  name = 'Phase15AuthPolicy1787170000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "credentials" DROP CONSTRAINT "chk_credentials_type"`);
    await queryRunner.query(
      `ALTER TABLE "credentials" ADD CONSTRAINT "chk_credentials_type" CHECK ("type" IN ('PASSWORD', 'SSH_PUBLIC_KEY', 'GITHUB', 'PASSKEY', 'RECOVERY_CODE'))`,
    );

    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "chk_notifications_type"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "chk_notifications_type" CHECK ("type" IN ('FOLLOW', 'LIKE', 'REPLY', 'MENTION', 'MODERATION', 'MESSAGE', 'REPOST', 'QUOTE', 'COMMUNITY_INVITE', 'FOLLOW_REQUEST', 'SECURITY'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "chk_notifications_type"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "chk_notifications_type" CHECK ("type" IN ('FOLLOW', 'LIKE', 'REPLY', 'MENTION', 'MODERATION', 'MESSAGE', 'REPOST', 'QUOTE', 'COMMUNITY_INVITE', 'FOLLOW_REQUEST'))`,
    );

    await queryRunner.query(`ALTER TABLE "credentials" DROP CONSTRAINT "chk_credentials_type"`);
    await queryRunner.query(
      `ALTER TABLE "credentials" ADD CONSTRAINT "chk_credentials_type" CHECK ("type" IN ('PASSWORD', 'SSH_PUBLIC_KEY', 'GITHUB', 'PASSKEY'))`,
    );
  }
}
