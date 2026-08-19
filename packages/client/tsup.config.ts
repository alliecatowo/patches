import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/connect.ts', 'src/grpc.ts'],
  tsconfig: 'tsconfig.build.json',
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node24',
  // Keep the entries separate: importing the root or `./connect` (web/RN, ADR 0016 §9)
  // must never pull in `@connectrpc/connect-node` (grpc-js/http2, Node-only), and
  // `./grpc` (Node/TUI) has no reason to load `@connectrpc/connect-web`'s fetch shims.
  splitting: false,
  external: [
    '@bufbuild/protobuf',
    '@connectrpc/connect',
    '@connectrpc/connect-node',
    '@connectrpc/connect-web',
    '@patches/proto',
  ],
});
