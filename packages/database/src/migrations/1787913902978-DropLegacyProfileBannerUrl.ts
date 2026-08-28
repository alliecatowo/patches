import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * No v0.0.1+ legacy paths (owner rule 2026-08-28): drops the URL-text `actors.profile_banner_
 * url` column entirely — direct-to-R2 `banner_media_id` (`ActorBannerMedia`) replaced it as
 * the only banner write/read path before any release, so there is no compatibility surface to
 * preserve. Data is not kept (pre-release; no product ever depended on this column).
 *
 * Hand-written, not `pnpm db:generate`: a plain `DROP COLUMN` is unambiguous here (no rename
 * to distinguish from a drop, spec §60's "review every generated migration by hand" concern),
 * and generating would again pick up unrelated in-progress drift from other agents in this
 * shared tree (same reasoning as `ActorBannerMedia`'s comment).
 */
export class DropLegacyProfileBannerUrl1787913902978 implements MigrationInterface {
  name = 'DropLegacyProfileBannerUrl1787913902978';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "actors" DROP COLUMN "profile_banner_url"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "actors" ADD "profile_banner_url" text`);
  }
}
