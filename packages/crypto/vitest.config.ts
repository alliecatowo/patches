import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'crypto',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Enforced only when coverage is actually collected (`vitest run --coverage`,
    // CI's build-test job) — plain `pnpm test` stays fast and never pays for it.
    // Floors sit ~3-6pts under the 2026-08-25 measurement (lines 90.25, branches
    // 76.01, statements 88.29) so they catch regressions, not noise.
    coverage: {
      provider: 'v8',
      thresholds: { lines: 85, branches: 70, statements: 85 },
    },
  },
});
