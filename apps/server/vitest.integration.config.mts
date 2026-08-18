import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';

/**
 * `TEST_DATABASE_URL_SERVER`, falling back to `TEST_DATABASE_URL` with the database
 * name swapped to `patches_test_server` — its own database, never `patches_test`
 * (which `database`/`testkit` drop and recreate; see docs/operations/ci.md "Why one
 * database" and tasks.md A-006). No DB-backed integration test exists yet (Phase 1
 * lands persistence), so this is currently inert, but wiring it now means a future
 * server integration test that needs Postgres doesn't have to touch CI or this file.
 */
function serverTestDatabaseUrl(): string | undefined {
  const explicit = process.env.TEST_DATABASE_URL_SERVER;
  if (explicit !== undefined && explicit.length > 0) return explicit;

  const base = process.env.TEST_DATABASE_URL;
  if (base === undefined || base.length === 0) return undefined;
  return base.replace(/\/[^/?]+(\?.*)?$/, '/patches_test_server$1');
}

const testDatabaseUrl = serverTestDatabaseUrl();
if (testDatabaseUrl === undefined) {
  console.warn(
    '[apps/server] TEST_DATABASE_URL is not set — skipping the server integration suite ' +
      '(every RPC now boots against PostgreSQL). Start it with `mise run compose -- up -d`.',
  );
}

// Integration tests boot a real Nest microservice on a real port and talk to it
// through @grpc/grpc-js. Kept in a separate project so `pnpm test` stays fast and
// CI can run them on their own (`pnpm test:integration`).
export default defineProject({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'server-integration',
    environment: 'node',
    globals: false,
    include: testDatabaseUrl === undefined ? [] : ['test/**/*.integration.test.ts'],
    // Runs before any test file is imported, which is the only point at which the
    // environment can still be changed — see test/support/env.ts.
    setupFiles: ['./test/support/setup-env.mts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: testDatabaseUrl === undefined ? {} : { TEST_DATABASE_URL: testDatabaseUrl },
    // Every integration file's `beforeAll` calls `createServerTestDataSource()`, which
    // `dropDatabase()`s and re-migrates `patches_test_server` from scratch (spec §119). With
    // more than one integration file (added alongside posts/actors/feeds — previously only
    // `auth.integration.test.ts` existed, so this never surfaced) running those concurrently
    // races two files' migrations against the same database — TypeORM's migrations table and
    // `CREATE TYPE` both fail non-idempotently under that race. Files must run one at a time;
    // tests *within* a file still run concurrently as normal.
    fileParallelism: false,
  },
});
