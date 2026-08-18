import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'proto',
    environment: 'node',
    globals: false,
  },
});
