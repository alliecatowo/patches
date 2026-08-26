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
  const raw = run(['pages', 'deployment', 'list', '--project-name', 'patches-web', '--json']);
  // Structured output (docs/research/wrangler.md), not the box-drawing table B-173 replaced —
  // a wrangler version that stops emitting this shape must fail this job loudly (no
  // `continue-on-error` swallow below) instead of silently sweeping nothing, or the
  // orphan-Pages leak B-154 fixed comes back with no signal.
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) {
    throw new Error(`wrangler --json output was not an array: ${raw.slice(0, 200)}`);
  }
  const branch = `pr-${pr}`;
  const ids = rows
    .map((row, index) => {
      if (typeof row !== 'object' || row === null) {
        throw new Error(`deployment row ${index} was not an object: ${JSON.stringify(row)}`);
      }
      const { Id, Branch } = row;
      if (typeof Id !== 'string' || typeof Branch !== 'string') {
        throw new Error(`deployment row ${index} missing string Id/Branch: ${JSON.stringify(row)}`);
      }
      return { id: Id, branch: Branch };
    })
    .filter((row) => row.branch === branch)
    .map((row) => row.id);
  if (ids.length === 0) {
    console.log(`no Pages deployments on branch ${branch} — nothing to clean`);
  }
  for (const id of ids) {
    console.log(`deleting Pages deployment ${id} (branch ${branch})`);
    run(['pages', 'deployment', 'delete', id, '--project-name', 'patches-web', '-f']);
  }
  console.log(`done: ${ids.length} deployment(s) removed`);
} catch (err) {
  console.error(String(err));
  process.exit(1);
}
