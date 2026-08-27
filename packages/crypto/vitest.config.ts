import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'crypto',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    maxWorkers: '50%',
  },
});
