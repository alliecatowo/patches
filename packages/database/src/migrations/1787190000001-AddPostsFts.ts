import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostsFts1787190000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE posts
      ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
        to_tsvector('english', COALESCE(body, '')
      ) STORED;
    `);
    await queryRunner.query('CREATE INDEX idx_posts_tsv ON posts USING GIN (tsv);');
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    await _queryRunner.query('DROP INDEX IF EXISTS idx_posts_tsv;');
    await _queryRunner.query('ALTER TABLE posts DROP COLUMN IF EXISTS tsv;');
  }
}
