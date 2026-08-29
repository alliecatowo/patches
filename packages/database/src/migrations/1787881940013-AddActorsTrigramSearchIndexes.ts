import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #223: `ActorService.searchActors` matches `actor.handleNormalized LIKE 'prefix%' OR
 * actor.displayName ILIKE '%contains%'`. The `displayName` half has a leading wildcard, which
 * no plain btree index can serve; the `handleNormalized` half is a genuine prefix match, but
 * the test/prod locale is `en_US.utf8` (confirmed via `pg_database.datcollate`), not `C` —
 * a default btree can't use it for `LIKE` either without a `text_pattern_ops` opclass. Every
 * `SearchActors` call was therefore a sequential scan of `actors` (confirmed with `EXPLAIN
 * (ANALYZE, BUFFERS)` against a ~3k-actor fixture before this migration).
 *
 * `pg_trgm` is a stock Postgres contrib extension (same posture `AddPgStatStatements` already
 * took) — bundled with the `postgres:17-alpine` image this repo runs locally/in CI, and a
 * supported extension on both Fly Postgres and Neon (no custom build/allowlist step needed on
 * either). A GIN trigram index serves both the leading-wildcard `ILIKE` on `display_name` and
 * the prefix `LIKE` on `handle_normalized` regardless of collation, so both predicates in the
 * existing `OR` get an index-backed `BitmapOr` plan instead of a sequential scan.
 *
 * Declared in `actor.entity.ts` as `@Index(name, { synchronize: false })` — TypeORM's
 * decorator-driven diffing has no vocabulary for a GIN index with a non-default operator
 * class, so it can never be declared column-accurately, but naming it with
 * `synchronize: false` still tells `migration:generate` the index is intentional and to
 * leave it alone instead of proposing a drop.
 */
export class AddActorsTrigramSearchIndexes1787881940013 implements MigrationInterface {
  name = 'AddActorsTrigramSearchIndexes1787881940013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    await queryRunner.query(
      'CREATE INDEX idx_actors_handle_normalized_trgm ON actors USING GIN (handle_normalized gin_trgm_ops);',
    );
    await queryRunner.query(
      'CREATE INDEX idx_actors_display_name_trgm ON actors USING GIN (display_name gin_trgm_ops);',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_actors_display_name_trgm;');
    await queryRunner.query('DROP INDEX IF EXISTS idx_actors_handle_normalized_trgm;');
    // `pg_trgm` itself is left installed on down — dropping a shared extension other schema
    // objects might also depend on is out of scope for reverting one index pair.
  }
}
