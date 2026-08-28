import { defineConfig } from 'vitest/config';

// Root config: every workspace with a vitest.config.ts becomes a project.
// Run all: `pnpm test`. One project: `pnpm vitest run --project server`.
export default defineConfig({
  test: {
    // #263: `dot` prints one character per test file (no per-file PASS lines, no suite
    // headers) and still prints the full failure (error, stack, file/line) for anything
    // red — an agent scanning `pnpm test` output for the actionable signal shouldn't have
    // to tail/widen past hundreds of green lines to find it.
    reporters: ['dot'],
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
