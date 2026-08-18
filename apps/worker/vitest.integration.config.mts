import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';

/**
 * `TEST_DATABASE_URL_WORKER`, falling back to `TEST_DATABASE_URL` with the database name
 * swapped to `patches_test_worker` — the worker's own database, never `patches_test` (which
 * `database`/`testkit` drop and recreate; see docs/operations/ci.md "Why one database" and
 * `apps/server/vitest.integration.config.mts`, which does the same thing for the server).
 */
function workerTestDatabaseUrl(): string | undefined {
  const explicit = process.env.TEST_DATABASE_URL_WORKER;
  if (explicit !== undefined && explicit.length > 0) return explicit;

  const base = process.env.TEST_DATABASE_URL;
  if (base === undefined || base.length === 0) return undefined;
  return base.replace(/\/[^/?]+(\?.*)?$/, '/patches_test_worker$1');
}

const testDatabaseUrl = workerTestDatabaseUrl();

// Integration tests boot the real JobRunner against a real Postgres database and a
// ConsoleEmailProvider. Kept in a separate project so `pnpm test` stays fast and CI can
// run them on their own (`pnpm test:integration`).
export default defineProject({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'worker-integration',
    environment: 'node',
    globals: false,
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
    env: testDatabaseUrl === undefined ? {} : { TEST_DATABASE_URL: testDatabaseUrl },
  },
});
