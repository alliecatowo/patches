import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // tsconfig.json is the lint/typecheck project (it also covers spike/ and configs);
  // the build needs the narrower, emit-enabled one.
  tsconfig: 'tsconfig.build.json',
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node24',
  // Native (sharp) and framework (ink/react) deps must stay external: bundling
  // sharp breaks its prebuilt binary resolution, and duplicating React breaks hooks.
  external: ['sharp', 'ink', 'react', 'react/jsx-runtime'],
});
