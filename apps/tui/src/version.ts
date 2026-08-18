import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The TUI build version, read from `apps/tui/package.json` at runtime.
 *
 * Read rather than imported so the emitted `dist/` layout stays flat: a
 * `resolveJsonModule` import of `../package.json` would sit outside `rootDir`
 * and push every output file down one directory. `package.json` is one level
 * above both `src/` and `dist/`, so the same hop works either way.
 */
function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw: unknown = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
  if (typeof raw === 'object' && raw !== null && 'version' in raw) {
    const { version } = raw;
    if (typeof version === 'string') return version;
  }
  throw new Error('apps/tui/package.json has no "version"');
}

export const TUI_VERSION: string = readVersion();

/** Value sent in the `x-patches-client` metadata header (spec §44). */
export const CLIENT_NAME = 'tui';
