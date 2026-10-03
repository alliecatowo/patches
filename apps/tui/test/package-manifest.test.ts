import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('published manifest', () => {
  it('lists no private @patches/* workspace package under dependencies', () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    // These are bundled into dist/cli.js (tsup noExternal) and never published, so a runtime
    // dependency on them makes `npm install` of the release tarball fail with E404.
    const leaked = Object.keys(manifest.dependencies ?? {}).filter((name) =>
      name.startsWith('@patches/'),
    );
    expect(leaked).toEqual([]);
  });
});
