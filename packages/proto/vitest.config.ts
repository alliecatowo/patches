import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'proto',
    environment: 'node',
    globals: false,
    // Scoped to src on purpose: without it, compiled copies in dist/ get
    // collected too and every test runs twice.
    include: ['src/**/*.test.ts'],
    // #302: overridable so scripts/bounded.sh can cap worker pools under concurrent agent load.
    maxWorkers: process.env.VITEST_MAX_WORKERS ? Number(process.env.VITEST_MAX_WORKERS) : '50%',
  },
});
