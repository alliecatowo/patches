import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rapid personalization (owner request 2026-08-25): four additive, nullable cosmetics
 * columns on `actors`. Additive only — no index needed (never queried on), no default, so
 * existing rows read as "un-customized" and every client's no-cosmetic degradation path is
 * the live one from day one.
 *
 * Generated via `pnpm db:generate`, then hand-trimmed: the generator also emitted drift
 * from other agents' in-progress entity edits in this shared tree (posts.tsv, a
 * rate_limit_buckets PK change, an e2ee index swap) that belongs to their changes, not
 * this one — only the four `actors` columns below are part of this task.
 */
export class ActorPersonalization1787669032825 implements MigrationInterface {
  name = 'ActorPersonalization1787669032825';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "actors" ADD "profile_banner_url" text`);
    await queryRunner.query(`ALTER TABLE "actors" ADD "profile_frame" character varying(31)`);
    await queryRunner.query(`ALTER TABLE "actors" ADD "name_tag_style" character varying(31)`);
    await queryRunner.query(`ALTER TABLE "actors" ADD "accent_color" character varying(31)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "actors" DROP COLUMN "accent_color"`);
    await queryRunner.query(`ALTER TABLE "actors" DROP COLUMN "name_tag_style"`);
    await queryRunner.query(`ALTER TABLE "actors" DROP COLUMN "profile_frame"`);
    await queryRunner.query(`ALTER TABLE "actors" DROP COLUMN "profile_banner_url"`);
  }
}
