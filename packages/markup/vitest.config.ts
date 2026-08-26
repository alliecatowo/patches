import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'markup',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    maxWorkers: '50%',
  },
});
