import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { z } from 'zod';

const packageJsonSchema = z.object({ name: z.string(), version: z.string().min(1) });

const PACKAGE_NAME = '@patches/server';

/** Append a validated source revision without making malformed environment input observable. */
export function formatServerVersion(version: string, buildSha: string | undefined): string {
  const normalizedSha = buildSha?.trim().toLowerCase();
  return normalizedSha !== undefined && /^[0-9a-f]{7,40}$/.test(normalizedSha)
    ? `${version}+${normalizedSha.slice(0, 7)}`
    : version;
}

/**
 * The server build version, read from `apps/server/package.json` at runtime.
 *
 * Read rather than `import`ed: with `resolveJsonModule` the import would sit
 * outside `rootDir` and shift the emitted `dist/` layout.
 *
 * The search walks *up* from this module instead of hard-coding `../../..`
 * because the same source runs from three different depths — `src/` under
 * vitest, `dist/` in production, and bundled test transforms — and an off-by-one
 * relative hop fails silently in only one of them.
 */
export function readServerVersion(startDir: string = moduleDirectory()): string {
  let current = startDir;

  for (;;) {
    const candidate = join(current, 'package.json');
    if (existsSync(candidate)) {
      const parsed = packageJsonSchema.safeParse(JSON.parse(readFileSync(candidate, 'utf8')));
      if (parsed.success && parsed.data.name === PACKAGE_NAME) {
        return formatServerVersion(parsed.data.version, process.env['PATCHES_BUILD_SHA']);
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Could not find ${PACKAGE_NAME}'s package.json above ${startDir}`);
    }
    current = parent;
  }
}

/**
 * `__dirname` when this module is loaded as CommonJS (production and `tsc` output).
 * Vitest transforms the file to an ES module where `__dirname` does not exist, so
 * fall back to the vitest project root, which is `apps/server`.
 */
function moduleDirectory(): string {
  return typeof __dirname === 'string' ? __dirname : process.cwd();
}
