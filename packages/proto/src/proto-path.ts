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

let cachedProtoDir: string | undefined;

/**
 * Absolute path to the directory containing the canonical `.proto` files.
 *
 * Lazy and memoised (A-010): resolving/validating this directory is real file-system I/O
 * that can throw (a broken package install, a `"files"` field regression). Doing that
 * eagerly at module-import time meant importing *anything* from `@patches/proto` — even a
 * pure type — could throw before any caller actually asked for a proto path. Now the
 * `existsSync` check only runs the first time something calls this function.
 *
 * The layout puts `proto/` one level above both `src/` and `dist/`, so the same relative hop
 * resolves whether this module is loaded from TypeScript source (vitest, `tsx`) or from the
 * built `dist/`.
 */
export function getProtoDir(): string {
  if (cachedProtoDir === undefined) {
    const candidate = resolve(moduleDir, '..', 'proto');
    if (!existsSync(candidate)) {
      throw new Error(
        `@patches/proto: could not locate the proto/ directory (looked in ${candidate}). ` +
          'The package must ship proto/ alongside dist/ — check the "files" field.',
      );
    }
    cachedProtoDir = candidate;
  }
  return cachedProtoDir;
}

let cachedProtoFiles: readonly string[] | undefined;

/**
 * Every `.proto` file in the `patches.v1` package, as absolute paths. Lazy and memoised for
 * the same reason as {@link getProtoDir} — this is what actually triggers the directory
 * check, so it stays a function rather than a top-level constant.
 */
export function getProtoFiles(): readonly string[] {
  if (cachedProtoFiles === undefined) {
    const dir = getProtoDir();
    cachedProtoFiles = Object.freeze(
      [
        'common',
        'system',
        'auth',
        'actors',
        'posts',
        'feeds',
        'social_graph',
        'node',
        'reactions',
        'notifications',
        'moderation',
        'media',
        'pages',
      ].map((name) => join(dir, 'patches', 'v1', `${name}.proto`)),
    );
  }
  return cachedProtoFiles;
}

/** Absolute path to a single `.proto` file, e.g. `protoFile('patches/v1/system.proto')`. */
export function protoFile(relativePath: string): string {
  return join(getProtoDir(), ...relativePath.split('/'));
}
