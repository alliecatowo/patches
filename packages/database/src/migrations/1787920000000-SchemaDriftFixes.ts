import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #244: closes the two schema-diff gaps `pnpm db:generate --name=Probe` reported once the
 * entities were also fixed (`RateLimitBucket.windowStart` becoming a `@PrimaryColumn`,
 * `Post.tsv` and the `actors` trigram indexes becoming entity-declared, all in the same
 * change) — those three were pure entity fixes needing no schema change. These two are
 * real, narrow schema differences:
 *
 * - `posts.tsv` (`AddPostsFts1787190000001`) is `to_tsvector('english', COALESCE(body, ''))`
 *   STORED — `COALESCE` guarantees the expression never evaluates to NULL, so the column is
 *   safe to mark `NOT NULL` to match `Post.tsv`'s entity declaration (no `nullable: true`).
 *   Every existing row already satisfies it; no backfill needed.
 * - `idx_e2ee_signed_prekeys_retired_at_id` (`AddE2eeIssuedPrekeyLedger1787617557448`) was
 *   hand-named without running it through `SnakeNamingStrategy.indexName`, which sorts
 *   column names (`id` < `retired_at`) — the entity's `@Index(['retiredAt', 'id'], ...)`
 *   resolves to `idx_e2ee_signed_prekeys_id_retired_at`. Renaming the index is metadata-only
 *   (no rebuild) and the column order/predicate are already correct, so no `DROP`/`CREATE`.
 */
export class SchemaDriftFixes1787920000000 implements MigrationInterface {
  name = 'SchemaDriftFixes1787920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "posts" ALTER COLUMN "tsv" SET NOT NULL`);
    await queryRunner.query(
      `ALTER INDEX "idx_e2ee_signed_prekeys_retired_at_id" RENAME TO "idx_e2ee_signed_prekeys_id_retired_at"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER INDEX "idx_e2ee_signed_prekeys_id_retired_at" RENAME TO "idx_e2ee_signed_prekeys_retired_at_id"`,
    );
    await queryRunner.query(`ALTER TABLE "posts" ALTER COLUMN "tsv" DROP NOT NULL`);
  }
}
