import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The TUI build version, read from `apps/tui/package.json` at runtime.
 *
 * Read rather than imported so the emitted `dist/` layout stays flat: a
 * `resolveJsonModule` import of `../package.json` would sit outside `rootDir`
 * and push every output file down one directory. Two layouts exist at runtime:
 * a `package.json` one level above the script (repo `dist/`, dev `src/`, and
 * the published npm tarball, where `bin: dist/cli.js` sits under the package
 * root), or one next to it (the `mise run tui` snapshot, which mirrors the
 * published layout but is a bare copy of `dist/`).
 */
function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, 'package.json'), join(here, '..', 'package.json')]) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(candidate, 'utf8'));
    } catch {
      continue; // not this layout — try the next candidate
    }
    if (typeof raw === 'object' && raw !== null && 'version' in raw) {
      const { version } = raw;
      if (typeof version === 'string') return version;
    }
  }
  throw new Error('apps/tui/package.json has no "version"');
}

export const TUI_VERSION: string = readVersion();

/** Value sent in the `x-patches-client` metadata header (spec §44). */
export const CLIENT_NAME = 'tui';
