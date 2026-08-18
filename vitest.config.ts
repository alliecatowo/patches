import { defineConfig } from 'vitest/config';

// Root config: every workspace with a vitest.config.ts becomes a project.
// Run all: `pnpm test`. One project: `pnpm vitest run --project server`.
export default defineConfig({
  test: {
    // A glob that resolves to a directory picks up that directory's single
    // `vitest.config.ts`, so extra projects in the same workspace (integration
    // suites) have to be listed by path.
    projects: [
      'packages/*',
      'apps/*',
      'apps/admin/vitest.integration.config.mts',
      'apps/server/vitest.integration.config.mts',
      'apps/worker/vitest.integration.config.mts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['**/src/generated/**', '**/dist/**', '**/*.config.*', '**/spike/**'],
    },
  },
});
