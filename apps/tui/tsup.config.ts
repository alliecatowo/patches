import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.tsx'],
  // tsconfig.json is the lint/typecheck project (it also covers test/ and
  // vitest.config.ts); the build needs the narrower, emit-enabled one — mirrors
  // packages/terminal-media/tsup.config.ts.
  tsconfig: 'tsconfig.build.json',
  format: ['esm'],
  // A CLI bin has no consumers importing types — skip declaration output.
  dts: false,
  sourcemap: false,
  clean: true,
  target: 'node24',
  platform: 'node',
  // No `banner` here: `src/cli.tsx` already starts with `#!/usr/bin/env node`
  // and esbuild preserves a leading shebang from the entry file verbatim.
  // Adding the same line again via `banner.js` produces two shebang lines —
  // the first is a valid hashbang, but the second is a bare `#` at the start
  // of a JS statement, which is a `SyntaxError` (verified: `node dist/cli.js`
  // failed with "Invalid or unexpected token" until this was removed).
  // Bundle the three private, unpublished workspace packages straight into
  // cli.js (P9-003/A-046): @patches/domain, @patches/proto and
  // @patches/terminal-media are `private: true` and never published to npm, so
  // a real `npm install -g patches-social` from the registry cannot resolve
  // them as separate dependencies. Everything else — native addons (sharp,
  // @napi-rs/keyring) and packages that must stay a single shared instance
  // (ink, react) — stays external and ships as a real npm dependency instead.
  noExternal: [/^@patches\//],
  external: [
    'ink',
    'react',
    'react/jsx-runtime',
    '@grpc/grpc-js',
    '@grpc/proto-loader',
    '@inkjs/ui',
    '@napi-rs/keyring',
    'sharp',
    'zod',
  ],
});
