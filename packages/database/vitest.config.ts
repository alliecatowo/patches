import { defineProject } from 'vitest/config';

// One project, two kinds of tests: fast unit tests (`src/**/*.test.ts`, no DB required)
// and Postgres-backed integration tests (`test/*.integration.test.ts`). The integration
// tests self-skip with a clear message when `TEST_DATABASE_URL` is unset, so plain
// `pnpm test` stays fast/DB-free by default; root `pnpm test:integration` runs
// `vitest run --project database` in an environment where `TEST_DATABASE_URL` is set
// (see root package.json), matching this project's name.
export default defineProject({
  test: {
    name: 'database',
    include: ['src/**/*.test.ts', 'test/**/*.integration.test.ts'],
    environment: 'node',
    // Integration tests in this package share one real database (TEST_DATABASE_URL) and
    // some of them drop/re-run the schema, so files must not run concurrently.
    fileParallelism: false,
  },
});
