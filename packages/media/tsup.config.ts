import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  tsconfig: 'tsconfig.build.json',
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node24',
  // The AWS SDK ships its own CJS/ESM builds; bundling it in would duplicate a large
  // dependency across every consumer instead of letting Node's resolver share one copy.
  external: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
});
