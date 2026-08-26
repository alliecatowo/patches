import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'proto',
    environment: 'node',
    globals: false,
    // Scoped to src on purpose: without it, compiled copies in dist/ get
    // collected too and every test runs twice.
    include: ['src/**/*.test.ts'],
    maxWorkers: '50%',
  },
});
