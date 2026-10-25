import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'web',
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // React/JSDOM component tests drive DOM/timer state updates that can flake under
    // CPU contention when test files run concurrently. Parallelizing files within web
    // causes intermittent `waitFor` and state update failures in tests.
    fileParallelism: false,
    // #302: overridable so scripts/bounded.sh can cap worker pools under concurrent agent load.
    maxWorkers: process.env.VITEST_MAX_WORKERS ? Number(process.env.VITEST_MAX_WORKERS) : '50%',
  },
});
