#!/usr/bin/env node
// B-168 — size budget gate for apps/web/dist/assets/*.js, run after `vite build`.
// Fails (non-zero exit) if any built JS chunk exceeds the raw or gzip threshold in
// ../bundle-budget.json. Thresholds and their provenance live in that file, not here.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(webRoot, 'dist', 'assets');

/** @type {{ maxChunkBytes: number; maxChunkGzipBytes: number }} */
const budget = JSON.parse(readFileSync(join(webRoot, 'bundle-budget.json'), 'utf8'));

let entries;
try {
  entries = readdirSync(assetsDir);
} catch {
  console.error(`bundle:check — no ${assetsDir}. Run \`pnpm --filter @patches/web build\` first.`);
  process.exit(1);
}

const jsFiles = entries.filter((name) => name.endsWith('.js'));
if (jsFiles.length === 0) {
  console.error(`bundle:check — no .js chunks found under ${assetsDir}.`);
  process.exit(1);
}

let failed = false;
for (const name of jsFiles) {
  const filePath = join(assetsDir, name);
  const rawBytes = statSync(filePath).size;
  const gzipBytes = gzipSync(readFileSync(filePath)).length;

  const overRaw = rawBytes > budget.maxChunkBytes;
  const overGzip = gzipBytes > budget.maxChunkGzipBytes;
  if (overRaw || overGzip) {
    failed = true;
    console.error(
      `bundle:check — ${name} exceeds budget: ${rawBytes} B raw (limit ${budget.maxChunkBytes}), ` +
        `${gzipBytes} B gzip (limit ${budget.maxChunkGzipBytes}).`,
    );
  }
}

if (failed) {
  console.error(
    'bundle:check — see apps/web/bundle-budget.json for how these thresholds were chosen, ' +
      'and `pnpm --filter @patches/web run bundle:analyze` to inspect what grew.',
  );
  process.exit(1);
}

console.log(`bundle:check — ${jsFiles.length} chunk(s) within budget.`);
