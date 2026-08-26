#!/usr/bin/env node
// B-203 — same guard as apps/web/scripts/verify-deployed-sha.mjs, adapted for `site/`:
// nothing here proves a `wrangler pages deploy` return code means the published page
// actually changed. `site/.vitepress/config.mts`'s `commitSha()` bakes `git rev-parse
// --short HEAD` into the footer at build time (`Built from <a href=".../commit/<sha>">`),
// so this polls the live homepage for that anchor instead of a JS chunk (VitePress ships no
// equivalent of web's `__PATCHES_WEB__` runtime stamp). Currently only reachable once
// `SITE_DEPLOY_ENABLED` is flipped on (unset today — see docs/operations/site.md, "manual
// deploy"), at which point site.yml gates this step behind the same variable it gates the
// deploy step on.
//
// Cloudflare Pages propagation is not instant, so this polls with a bounded timeout instead
// of a single fetch or a blind sleep, and distinguishes "still serving the old sha after N
// seconds" from "couldn't find/parse the commit link at all".
import { setTimeout as delay } from 'node:timers/promises';

const deployUrl = process.env['VERIFY_DEPLOY_URL'] ?? 'https://patches-site.pages.dev/';
const targetSha = process.env['TARGET_SHA'];
const timeoutMs = Number(process.env['VERIFY_TIMEOUT_MS'] ?? '180000');
const pollIntervalMs = Number(process.env['VERIFY_POLL_INTERVAL_MS'] ?? '15000');

if (!targetSha) {
  console.error('verify-deployed-sha — TARGET_SHA is not set.');
  process.exit(1);
}
const targetShort = targetSha.trim().slice(0, 7);

/**
 * @param {string} url
 */
async function fetchFresh(url) {
  const bustUrl = new URL(url);
  bustUrl.searchParams.set('_verify', Date.now().toString());
  const response = await fetch(bustUrl, {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Extracts the short sha from the footer's `.../commit/<sha>` anchor href.
 * @param {string} html
 * @returns {string | null}
 */
function extractDeployedSha(html) {
  const match = /\/commit\/([0-9a-f]{7,40})"/.exec(html);
  return match ? match[1].slice(0, 7) : null;
}

async function main() {
  const start = Date.now();
  /** @type {{ kind: 'network' | 'unparseable' | 'stale'; detail: string }} */
  let last = { kind: 'network', detail: 'no attempt made yet' };
  let attempts = 0;

  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    let html;
    try {
      html = await fetchFresh(deployUrl);
    } catch (err) {
      last = {
        kind: 'network',
        detail: `fetching ${deployUrl}: ${/** @type {Error} */ (err).message}`,
      };
      await delay(pollIntervalMs);
      continue;
    }

    const deployedSha = extractDeployedSha(html);
    if (deployedSha === null) {
      last = { kind: 'unparseable', detail: `no footer commit link found in ${deployUrl}` };
      await delay(pollIntervalMs);
      continue;
    }

    if (deployedSha === targetShort) {
      console.log(
        `verify-deployed-sha — ${deployUrl} footer reports sha ${deployedSha}, matches deployed ` +
          `commit ${targetShort} (attempt ${attempts}, ${Date.now() - start}ms).`,
      );
      return;
    }

    last = { kind: 'stale', detail: `${deployUrl} footer reports sha ${deployedSha}` };
    await delay(pollIntervalMs);
  }

  const elapsed = Date.now() - start;
  if (last.kind === 'stale') {
    console.error(
      `verify-deployed-sha — still serving an old sha after ${elapsed}ms (${attempts} attempts): ` +
        `${last.detail}, expected ${targetShort}.`,
    );
  } else if (last.kind === 'unparseable') {
    console.error(
      `verify-deployed-sha — could not parse a commit stamp after ${elapsed}ms (${attempts} attempts): ` +
        `${last.detail}.`,
    );
  } else {
    console.error(
      `verify-deployed-sha — could not reach the deployed site after ${elapsed}ms (${attempts} attempts): ` +
        `${last.detail}.`,
    );
  }
  process.exit(1);
}

await main();
