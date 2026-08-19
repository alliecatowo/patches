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
 *
 * Three ways to point this at the right directory, checked in order (P9-003/A-046):
 *
 * 1. `PATCHES_PROTO_DIR` env override — for anything unusual (containers, tests) that wants
 *    to say exactly where the `.proto` tree lives without touching code.
 * 2. A `proto/` directory *next to this module* (`<moduleDir>/proto`). This is the case when
 *    `@patches/proto`'s own source is bundled straight into a consumer's single-file build —
 *    `apps/tui`'s tsup config inlines this module into `dist/cli.js` via `noExternal`, so
 *    `import.meta.url` resolves to `apps/tui/dist/cli.js`'s own location, not
 *    `packages/proto/dist/`. The consumer's build then copies `packages/proto/proto/**` to
 *    `<its-own-dist>/proto/` (see `apps/tui/scripts/copy-proto.mjs`) to satisfy this.
 * 3. The original `<moduleDir>/../proto` hop — `@patches/proto` used unbundled, exactly as
 *    published (`dist/` and `proto/` as siblings under the package root).
 */
export function getProtoDir(): string {
  if (cachedProtoDir === undefined) {
    const override = process.env.PATCHES_PROTO_DIR;
    if (override !== undefined && override !== '' && existsSync(override)) {
      cachedProtoDir = resolve(override);
      return cachedProtoDir;
    }

    const bundledSibling = resolve(moduleDir, 'proto');
    const unbundledParent = resolve(moduleDir, '..', 'proto');
    const candidate = existsSync(bundledSibling) ? bundledSibling : unbundledParent;
    if (!existsSync(candidate)) {
      throw new Error(
        `@patches/proto: could not locate the proto/ directory (looked in ${bundledSibling} ` +
          `and ${unbundledParent}). The package must ship proto/ alongside dist/ (or a bundling ` +
          'consumer must copy it next to its own output) — check the "files" field, or set ' +
          'PATCHES_PROTO_DIR.',
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
        'communities',
        'posts',
        'feeds',
        'social_graph',
        'node',
        'reactions',
        'notifications',
        'moderation',
        'media',
        'pages',
        'messages',
        'tags',
        'filters',
        'filter_lists',
        'labels',
        'appeals',
        'privacy',
      ].map((name) => join(dir, 'patches', 'v1', `${name}.proto`)),
    );
  }
  return cachedProtoFiles;
}

/** Absolute path to a single `.proto` file, e.g. `protoFile('patches/v1/system.proto')`. */
export function protoFile(relativePath: string): string {
  return join(getProtoDir(), ...relativePath.split('/'));
}
