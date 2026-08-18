import { createDataSource, runMigrationsForTests } from '@patches/database';
import type { DataSource } from 'typeorm';

/**
 * A fully-migrated database for `apps/admin`'s integration suite — its own database
 * (`patches_test_admin` by default, see `vitest.integration.config.mts` and
 * `docs/operations/ci.md`), never `patches_test`/`patches_test_server`/`patches_test_worker`
 * (`database`/`server-integration`/`worker-integration`'s own databases), same reasoning as
 * `apps/server/test/support/database.ts`.
 */
export async function createAdminTestDataSource(): Promise<DataSource> {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error(
      'TEST_DATABASE_URL (or TEST_DATABASE_URL_ADMIN) is not set. Start PostgreSQL with ' +
        '`mise run compose -- up -d` and export it before running the integration suite.',
    );
  }

  assertAdminTestDatabaseUrl(url);

  const dataSource = createDataSource({ url });
  await dataSource.initialize();
  // Every run starts from a known schema regardless of what the previous one left behind.
  await dataSource.dropDatabase();
  await runMigrationsForTests(dataSource);
  return dataSource;
}

/** Refuses any database whose name doesn't contain `test` (INITIAL_VISION.md §119) — this
 * function drops the entire schema, so the cost of the check is one string comparison and
 * the cost of skipping it is somebody's development database. */
export function assertAdminTestDatabaseUrl(url: string): void {
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error(`Refusing to use "${url}" for tests: it is not a valid database URL.`);
  }

  if (!databaseName.includes('test')) {
    throw new Error(
      `Refusing to use database "${databaseName}" for tests: this helper drops the entire ` +
        'schema, so the database name must contain "test" (INITIAL_VISION.md §119).',
    );
  }
}
