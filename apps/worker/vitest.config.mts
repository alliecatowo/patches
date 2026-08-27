import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';

// esbuild (Vitest's default transformer) drops `emitDecoratorMetadata`, which
// NestJS DI depends on. SWC honours the tsconfig flags, so it is used instead.
export default defineProject({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'worker',
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    maxWorkers: '50%',
    // B-178: main.test.ts dynamically imports the whole ESM app graph (real transform/compile
    // work, not a fixed timer) to assert dotenv loads before AppModule evaluates. Under the CPU
    // contention this repo's shared dev boxes see with several agent worktrees building/testing
    // concurrently, that import alone can exceed vitest's 5s default test timeout even though
    // nothing about the assertion is flaky — reproduced locally via `turbo run test --force`
    // (all 31 workspaces at once, no concurrency bound) failing this exact test with vitest's own
    // "if this is a long-running test, pass a timeout" hint. A generous fixed timeout is the
    // right fix here (not fileParallelism/maxWorkers, which bound *this* project's own footprint,
    // not contention from sibling packages' processes).
    testTimeout: 20_000,
  },
});
