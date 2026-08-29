import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';

/**
 * The latency-budget regression gate (#200) and the consolidated load/capacity suite (#199).
 * Kept out of `test:integration`'s `server-integration` project deliberately: both run
 * against the same real gRPC server + PostgreSQL as the integration suite, but they run many
 * iterations per scenario to get a stable p95, so they're slower and noisier than a
 * correctness test — CI runs them as a separate, non-required job (`docs/operations/
 * performance.md` "CI wiring"), never inside the required `ci-ok` gate.
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
    '[apps/server] TEST_DATABASE_URL is not set — skipping the perf suite. Start it with ' +
      '`mise run compose -- up -d`.',
  );
}

export default defineProject({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'server-perf',
    environment: 'node',
    globals: false,
    include: testDatabaseUrl === undefined ? [] : ['test/**/*.perf.test.ts'],
    setupFiles: ['./test/support/setup-env.mts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: testDatabaseUrl === undefined ? {} : { TEST_DATABASE_URL: testDatabaseUrl },
    // Same reasoning as vitest.integration.config.mts: every file's beforeAll drops and
    // re-migrates the shared `patches_test_server` database, so files can't run concurrently.
    fileParallelism: false,
  },
});
