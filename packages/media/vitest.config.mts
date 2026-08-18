import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'media',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
