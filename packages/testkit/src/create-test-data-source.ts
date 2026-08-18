import { createDataSource } from '@patches/database';
import type { DataSource } from 'typeorm';

/**
 * Builds and initializes a DataSource against `TEST_DATABASE_URL` (or an explicitly passed
 * URL), drops any existing schema, and runs every migration — so each test run starts from a
 * known, fully-migrated state regardless of what a previous run left behind. Never reads
 * `DATABASE_URL` — tests must never point at the dev database (INITIAL_VISION.md §119).
 *
 * Because this function's second act is `dropDatabase()`, it refuses any URL whose database
 * name doesn't end in `_test`: the cost of that check is one string comparison, and the cost
 * of not having it is someone's development (or, once, someone's production) database.
 */
export async function createTestDataSource(
  url = process.env.TEST_DATABASE_URL,
): Promise<DataSource> {
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Copy .env.example to .env at the repo root (or export ' +
        'TEST_DATABASE_URL) before using @patches/testkit.',
    );
  }

  assertTestDatabaseUrl(url);

  const dataSource = createDataSource({ url });
  await dataSource.initialize();
  await dataSource.dropDatabase();
  await dataSource.runMigrations();
  return dataSource;
}

/**
 * Throws unless `url`'s database name ends in `_test` (INITIAL_VISION.md §119). Exported for
 * its own unit test — the guard is worth testing precisely because nothing else will notice
 * if it silently stops working.
 */
export function assertTestDatabaseUrl(url: string): void {
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    // Not a parseable URL at all — report it the same way as a wrong-database URL rather
    // than letting the driver fail later with a less obvious message.
    throw new Error(`Refusing to use "${url}" for tests: it is not a valid database URL.`);
  }

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to use database "${databaseName}" for tests: createTestDataSource() drops the ` +
        'entire schema, so the database name must end in "_test" (INITIAL_VISION.md §119). ' +
        'Check TEST_DATABASE_URL — it must not point at your development database.',
    );
  }
}
