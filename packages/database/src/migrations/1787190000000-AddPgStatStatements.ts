import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Installs `pg_stat_statements` for the Phase 19 observability work — but only where the
 * server can actually support it: the extension requires `pg_stat_statements` in
 * `shared_preload_libraries`, which vanilla Postgres (local compose defaults, CI service
 * containers, some managed providers) does not set. Unconditional CREATE EXTENSION hangs
 * there until the statement timeout and takes every migration run down with it (seen in
 * CI on all stacked PRs). Nothing else references the extension yet, so skipping is a
 * clean no-op; environments that preload it get the extension automatically.
 */
export class AddPgStatStatements1787190000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const preloaded: unknown = await queryRunner.query('SHOW shared_preload_libraries;');
    const libraries = (Array.isArray(preloaded) ? preloaded[0] : undefined) as
      { shared_preload_libraries?: string } | undefined;
    if ((libraries?.shared_preload_libraries ?? '').includes('pg_stat_statements')) {
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');
    }
  }
  async down(_queryRunner: QueryRunner): Promise<void> {
    // Extension drops are destructive; no-op down for safety
  }
}
