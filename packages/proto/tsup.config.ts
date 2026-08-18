import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/nest.ts'],
  tsconfig: 'tsconfig.build.json',
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node24',
  // Rewrites `import.meta.url` for the CJS output (see src/proto-path.ts).
  shims: true,
  // Keep the two entries separate so importing the root never drags Nest in.
  splitting: false,
  external: ['@nestjs/microservices', '@grpc/grpc-js', '@grpc/proto-loader', 'rxjs'],
});
