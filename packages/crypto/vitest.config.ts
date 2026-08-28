import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'crypto',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    // #302: overridable so scripts/bounded.sh can cap worker pools under concurrent agent load.
    maxWorkers: process.env.VITEST_MAX_WORKERS ? Number(process.env.VITEST_MAX_WORKERS) : '50%',
  },
});
