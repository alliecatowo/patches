import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';

// Integration tests boot a real Nest microservice on a real port and talk to it
// through @grpc/grpc-js. Kept in a separate project so `pnpm test` stays fast and
// CI can run them on their own (`pnpm test:integration`).
export default defineProject({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'server-integration',
    environment: 'node',
    globals: false,
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
