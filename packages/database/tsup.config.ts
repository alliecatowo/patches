import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node24',
  // typeorm/pg/reflect-metadata stay external: they're real runtime deps of every
  // consumer (server, worker, testkit), not implementation details to bundle away.
  external: ['typeorm', 'pg', 'reflect-metadata', '@patches/config'],
});
