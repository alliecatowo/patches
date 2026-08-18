import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'testkit',
    include: ['src/**/*.test.ts', 'test/**/*.integration.test.ts'],
    environment: 'node',
  },
});
