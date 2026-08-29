import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Direct-to-R2 uploaded banner (owner request 2026-08-28, #324): additive nullable
 * `banner_media_id` column + FK on `actors`, same shape as the existing `avatar_media_id`
 * (`onDelete: 'SET NULL'` — a deleted media row un-sets the banner rather than blocking).
 * `profile_banner_url` (the legacy URL text field) was left in place at the time; it was
 * dropped by a later migration (`DropLegacyProfileBannerUrl`, owner rule 2026-08-28: no
 * v0.0.1+ legacy paths) once this column became the only banner write/read path.
 *
 * Generated via `pnpm db:generate`, then hand-trimmed: the generator also emitted drift from
 * other agents' in-progress entity edits in this shared tree (a `posts.tsv` column, an
 * `e2ee_signed_prekeys` index swap, a `rate_limit_buckets` PK change, two `NOT NULL`
 * tightenings on `e2ee_identity_roots`) that belongs to their changes, not this one — only the
 * `actors.banner_media_id` column and its FK below are part of this task.
 */
export class ActorBannerMedia1787912351805 implements MigrationInterface {
  name = 'ActorBannerMedia1787912351805';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "actors" ADD "banner_media_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "actors" ADD CONSTRAINT "fk_actors_banner_media_id" FOREIGN KEY ("banner_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "actors" DROP CONSTRAINT "fk_actors_banner_media_id"`);
    await queryRunner.query(`ALTER TABLE "actors" DROP COLUMN "banner_media_id"`);
  }
}
