import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';

// esbuild (Vitest's default transformer) drops type-only import elision edge cases that
// swc handles the same way the rest of the monorepo's CJS apps do — kept for consistency
// even though this package declares no decorated classes of its own.
export default defineProject({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'admin',
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    maxWorkers: '50%',
  },
});
