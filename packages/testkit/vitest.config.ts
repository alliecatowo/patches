import { defineProject } from 'vitest/config';

/**
 * `TEST_DATABASE_URL_TESTKIT`, falling back to `TEST_DATABASE_URL` with the database name
 * swapped to `patches_testkit_test` — its own database, never `patches_test` (which the
 * `database` project drops and recreates; see docs/operations/ci.md "Why one database" and
 * `apps/server/vitest.integration.config.mts`, which does the same thing for the server).
 * Closes out B-012: previously `testkit` shared `patches_test` with `database` and was only
 * safe because root `test:integration` ran with `--no-file-parallelism`.
 *
 * Named `patches_testkit_test` (suffix `_test`), not `patches_test_testkit` (infix): this
 * project's own integration suite calls the real, exported `createTestDataSource()` (it's
 * what's under test), and that function's `assertTestDatabaseUrl()` guard requires the
 * database name to *end* in `_test` (INITIAL_VISION.md §119) — deliberately strict, per
 * `create-test-data-source.test.ts`'s "refuses a name that merely contains _test" case.
 * `apps/server`/`apps/worker` sidestep this with their own local, looser
 * (`includes('test')`) guards instead of relaxing the shared one; testkit can't do that
 * without testing a fake instead of its own real guard, so the database name conforms to
 * the guard instead.
 */
function testkitTestDatabaseUrl(): string | undefined {
  const explicit = process.env.TEST_DATABASE_URL_TESTKIT;
  if (explicit !== undefined && explicit.length > 0) return explicit;

  const base = process.env.TEST_DATABASE_URL;
  if (base === undefined || base.length === 0) return undefined;
  return base.replace(/\/[^/?]+(\?.*)?$/, '/patches_testkit_test$1');
}

const testDatabaseUrl = testkitTestDatabaseUrl();

export default defineProject({
  test: {
    name: 'testkit',
    include: ['src/**/*.test.ts', 'test/**/*.integration.test.ts'],
    environment: 'node',
    // Own database now (see above), so no longer needs to be serialized against
    // `database`'s dropDatabase() calls at the root `test:integration` level. Individual
    // files within this project still run sequentially — createTestDataSource() drops and
    // re-migrates the shared `testkit` database itself, so two of *this project's own*
    // files running concurrently would race each other the same way database's do.
    fileParallelism: false,
    env: testDatabaseUrl === undefined ? {} : { TEST_DATABASE_URL: testDatabaseUrl },
  },
});
