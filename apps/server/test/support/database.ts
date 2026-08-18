import { createDataSource, runMigrationsForTests } from '@patches/database';
import type { DataSource } from 'typeorm';

/**
 * A fully-migrated database for the server's integration suite.
 *
 * `@patches/testkit`'s `createTestDataSource` is not used here for one reason: it requires the
 * database name to end in `_test`, and this suite deliberately runs against its own database
 * (`patches_test_server` by default, see `vitest.integration.config.mts` and
 * `docs/operations/ci.md`) so it never races the `dropDatabase()` calls the `database` and
 * `testkit` projects make against `patches_test`. The same guard is enforced below, just with
 * a rule that admits that name.
 */
export async function createServerTestDataSource(): Promise<DataSource> {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error(
      'TEST_DATABASE_URL (or TEST_DATABASE_URL_SERVER) is not set. Start PostgreSQL with ' +
        '`mise run compose -- up -d` and export it before running the integration suite.',
    );
  }

  assertServerTestDatabaseUrl(url);

  const dataSource = createDataSource({ url });
  await dataSource.initialize();
  // Every run starts from a known schema regardless of what the previous one left behind.
  await dataSource.dropDatabase();
  await runMigrationsForTests(dataSource);
  return dataSource;
}

/**
 * Refuses any database whose name doesn't contain `test` (INITIAL_VISION.md §119). This
 * function drops the entire schema; the cost of the check is one string comparison and the
 * cost of not having it is somebody's development database.
 */
export function assertServerTestDatabaseUrl(url: string): void {
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    // Unparseable: reported the same way as a wrong-database URL rather than left to fail
    // later inside the driver with a less obvious message.
    throw new Error(`Refusing to use "${url}" for tests: it is not a valid database URL.`);
  }

  if (!databaseName.includes('test')) {
    throw new Error(
      `Refusing to use database "${databaseName}" for tests: this helper drops the entire ` +
        'schema, so the database name must contain "test" (INITIAL_VISION.md §119).',
    );
  }
}
