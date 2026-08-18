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
  },
});
