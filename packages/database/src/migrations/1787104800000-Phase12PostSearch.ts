import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `PostService.searchPosts` (spec §194 — chronological, keyset-paged, no relevance ranking:
 * this index only accelerates the `@@` match itself, not any ordering). A GIN index over
 * `to_tsvector('simple', body)` — the `'simple'` config deliberately skips stemming/stop-word
 * removal so search behavior is the same regardless of the node operator's locale, matching
 * `FeedService`'s existing "no engagement/relevance signal" posture (§153).
 *
 * `COALESCE(body, '')` so the expression is well-defined for the nullable `body` column
 * (link/media-only or already-tombstoned posts) — `to_tsvector(NULL)` is `NULL`, which would
 * still work fine on its own for `@@`, but an expression index cannot be built over an
 * expression that can throw, and `COALESCE` keeps this identical to the query planner's own
 * index-expression matching in `PostService`'s query (it must use the exact same expression to
 * be used). No decorator on `Post` represents this — TypeORM 1.x's `@Index` targets columns,
 * not arbitrary expressions — so this migration is hand-written rather than
 * `pnpm db:generate`d, same as `Phase11SocialDepth`'s partial-unique indexes.
 */
export class Phase12PostSearch1787104800000 implements MigrationInterface {
  name = 'Phase12PostSearch1787104800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_posts_body_fts" ON "posts" USING GIN (to_tsvector('simple', COALESCE("body", '')))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_posts_body_fts"`);
  }
}
