import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Absolute path of the directory holding this module at runtime.
 *
 * `import.meta.url` is written here deliberately: the package builds dual
 * (ESM + CJS) via tsup with `shims: true`, which rewrites `import.meta.url`
 * into a `__filename`-based expression in the CJS output. Using `__dirname`
 * instead would be the wrong way round — tsup's ESM shim for `__dirname` only
 * applies to bundled code, and the source itself is ESM.
 */
const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the directory containing the canonical `.proto` files.
 *
 * The layout puts `proto/` one level above both `src/` and `dist/`, so the same
 * relative hop resolves whether this module is loaded from TypeScript source
 * (vitest, `tsx`) or from the built `dist/`.
 */
export const PROTO_DIR: string = (() => {
  const candidate = resolve(moduleDir, '..', 'proto');
  if (!existsSync(candidate)) {
    throw new Error(
      `@patches/proto: could not locate the proto/ directory (looked in ${candidate}). ` +
        'The package must ship proto/ alongside dist/ — check the "files" field.',
    );
  }
  return candidate;
})();

/** Every `.proto` file in the `patches.v1` package, as absolute paths. */
export const protoFiles: readonly string[] = Object.freeze([
  join(PROTO_DIR, 'patches', 'v1', 'common.proto'),
  join(PROTO_DIR, 'patches', 'v1', 'system.proto'),
]);

/** Absolute path to a single `.proto` file, e.g. `protoFile('patches/v1/system.proto')`. */
export function protoFile(relativePath: string): string {
  return join(PROTO_DIR, ...relativePath.split('/'));
}
