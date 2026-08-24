import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Full-text search column for local posts (P19-006, spec §112): a stored `tsvector`
 * generated with the **two-argument** `to_tsvector('english'::regconfig, text)` — the only
 * form Postgres considers IMMUTABLE and therefore legal in a generated column.
 *
 * `typeorm_metadata` is TypeORM's own bookkeeping table for generated columns: schema
 * introspection (`queryRunner.getTable('posts')`, `migration:generate`) resolves a
 * generated column's expression through it rather than the catalogs, and errors with
 * "relation typeorm_metadata does not exist" when a generated column is present but the
 * table is not. Migrations that introduce generated columns must therefore create it and
 * record the expression — the same SQL `migration:generate` would have emitted.
 */
export class AddPostsFts1787190000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE posts
      ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
        to_tsvector('english', COALESCE(body, ''))
      ) STORED;
    `);
    await queryRunner.query('CREATE INDEX idx_posts_tsv ON posts USING GIN (tsv);');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "typeorm_metadata" (
        "type" varchar(255) NOT NULL,
        "database" varchar(255),
        "schema" varchar(255),
        "table" varchar(255),
        "name" varchar(255),
        "value" text
      );
    `);
    await queryRunner.query(`
      INSERT INTO "typeorm_metadata" ("type", "database", "schema", "table", "name", "value")
      VALUES ('GENERATED_COLUMN', current_database(), 'public', 'posts', 'tsv',
              'to_tsvector(''english'', COALESCE(body, ''''))');
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata"
       WHERE "type" = 'GENERATED_COLUMN' AND "table" = 'posts' AND "name" = 'tsv';`,
    );
    await queryRunner.query('DROP TABLE IF EXISTS "typeorm_metadata";');
    await queryRunner.query('DROP INDEX IF EXISTS idx_posts_tsv;');
    await queryRunner.query('ALTER TABLE posts DROP COLUMN IF EXISTS tsv;');
  }
}
