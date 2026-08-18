import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'tui',
    environment: 'node',
    globals: false,
    // Scoped to src+test on purpose: without it, compiled copies in dist/ get
    // collected too and every test runs twice. `test/` holds the shared
    // `renderApp` harness (B-015) and the screen-level snapshot tests built on it.
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
  },
});
