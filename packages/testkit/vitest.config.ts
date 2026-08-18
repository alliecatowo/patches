import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'testkit',
    include: ['src/**/*.test.ts', 'test/**/*.integration.test.ts'],
    environment: 'node',
    // Shared real database, same reasoning as packages/database/vitest.config.ts.
    fileParallelism: false,
  },
});
