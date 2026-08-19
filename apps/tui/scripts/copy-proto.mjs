#!/usr/bin/env node
// Copies packages/proto/proto/** into apps/tui/dist/proto/ after the tsup
// build (P9-003/A-046).
//
// `@patches/proto`'s runtime (bundled straight into dist/cli.js via tsup's
// `noExternal`, see tsup.config.ts) resolves the `.proto` files it hands to
// `@grpc/proto-loader` relative to its own module directory at runtime
// (packages/proto/src/proto-path.ts's `getProtoDir()`). When @patches/proto's
// *code* is inlined into cli.js, that resolution runs from
// `apps/tui/dist/cli.js`'s own location — so the `.proto` tree has to
// physically live at `apps/tui/dist/proto/` for the sibling-of-the-bundle
// lookup `getProtoDir()` now tries first to find it. See the fallback added to
// `packages/proto/src/proto-path.ts` for the other half of this.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, '..');
const source = join(packageRoot, '..', '..', 'packages', 'proto', 'proto');
const destination = join(packageRoot, 'dist', 'proto');

if (!existsSync(source)) {
  throw new Error(
    `copy-proto: source directory not found (${source}). Run this from apps/tui after ` +
      'packages/proto has its proto/ tree checked out.',
  );
}

mkdirSync(dirname(destination), { recursive: true });
cpSync(source, destination, { recursive: true });

process.stdout.write(`copy-proto: copied ${source} -> ${destination}\n`);
