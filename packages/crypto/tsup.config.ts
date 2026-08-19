import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // Not `node24`: this package is also loaded by the browser web client and (later) React
  // Native, so it must not be down/up-levelled against Node-only assumptions.
  target: 'es2023',
  platform: 'neutral',
});
