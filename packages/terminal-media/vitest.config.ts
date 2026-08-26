import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'terminal-media',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    maxWorkers: '50%',
  },
});
