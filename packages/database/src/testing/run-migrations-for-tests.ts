import type { DataSource } from 'typeorm';

/**
 * Runs every pending migration against an already-`initialize()`d DataSource and returns
 * it. A thin, named wrapper around `dataSource.runMigrations()` so integration tests and
 * `packages/testkit` share one obvious call site instead of reaching for the DataSource API
 * directly and diverging over time.
 */
export async function runMigrationsForTests(dataSource: DataSource): Promise<DataSource> {
  await dataSource.runMigrations();
  return dataSource;
}
