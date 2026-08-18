import { defineConfig } from 'vitest/config';

// Root config: every workspace with a vitest.config.ts becomes a project.
// Run all: `pnpm test`. One project: `pnpm vitest run --project server`.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['**/src/generated/**', '**/dist/**', '**/*.config.*', '**/spike/**'],
    },
  },
});
