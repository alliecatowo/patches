#!/usr/bin/env node
// Preview orphan hygiene (B-154). Deletes every Cloudflare Pages deployment on branch
// `pr-<N>` — the Preview workflow's teardown job already destroys the Fly app and Neon
// branch; Pages was the leak (stale `pr-N.patches-web.pages.dev` frontends pointing at
// destroyed backends, 2026-08-26).
//
//   node infra/preview/preview-sweep.mjs --pr <N>
//
// Uses wrangler (devDependency, CI-authenticated via CLOUDFLARE_API_TOKEN env —
// exactly like the deploy step in preview.yml). `delete -f` skips the interactive
// confirm; without it wrangler falls back to "no" in non-interactive contexts.
// Requires CLOUDFLARE_ACCOUNT_ID (or wrangler config) exactly like `pages deploy`.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const prFlag = args.indexOf('--pr');
if (prFlag === -1 || !args[prFlag + 1]) {
  console.error('usage: preview-sweep.mjs --pr <N>');
  process.exit(1);
}
const pr = Number(args[prFlag + 1]);
if (!Number.isInteger(pr) || pr <= 0) {
  console.error('--pr needs a positive integer');
  process.exit(1);
}

const run = (cmdArgs) =>
  execFileSync('pnpm', ['exec', 'wrangler', ...cmdArgs], { encoding: 'utf8' });

try {
  const list = run(['pages', 'deployment', 'list', '--project-name', 'patches-web']);
  const rows = list
    .split('\n')
    .filter((line) => line.includes(`│ pr-${pr} `))
    .map((line) => {
      const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(line);
      return m?.[1];
    })
    .filter((id) => id !== undefined);
  if (rows.length === 0) {
    console.log(`no Pages deployments on branch pr-${pr} — nothing to clean`);
  }
  for (const id of rows) {
    console.log(`deleting Pages deployment ${id} (branch pr-${pr})`);
    run(['pages', 'deployment', 'delete', id, '--project-name', 'patches-web', '-f']);
  }
  console.log(`done: ${rows.length} deployment(s) removed`);
} catch (err) {
  console.error(String(err));
  process.exit(1);
}
