import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';

/**
 * `TEST_DATABASE_URL_ADMIN`, falling back to `TEST_DATABASE_URL` with the database name
 * swapped to `patches_test_admin` — the admin CLI's own database, never `patches_test`
 * (which `database`/`testkit` drop and recreate) and never `patches_test_server`/
 * `patches_test_worker` (their own suites' databases) — same reasoning as
 * `apps/server/vitest.integration.config.mts`/`apps/worker/vitest.integration.config.mts`.
 */
function adminTestDatabaseUrl(): string | undefined {
  const explicit = process.env.TEST_DATABASE_URL_ADMIN;
  if (explicit !== undefined && explicit.length > 0) return explicit;

  const base = process.env.TEST_DATABASE_URL;
  if (base === undefined || base.length === 0) return undefined;
  return base.replace(/\/[^/?]+(\?.*)?$/, '/patches_test_admin$1');
}

const testDatabaseUrl = adminTestDatabaseUrl();

// Integration tests exercise the CLI's command handlers against a real Postgres database.
// Kept in a separate project so `pnpm test` stays fast and CI can run them on their own
// (`pnpm test:integration`).
export default defineProject({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'admin-integration',
    environment: 'node',
    globals: false,
    include: testDatabaseUrl === undefined ? [] : ['test/**/*.integration.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
    env: testDatabaseUrl === undefined ? {} : { TEST_DATABASE_URL: testDatabaseUrl },
  },
});
