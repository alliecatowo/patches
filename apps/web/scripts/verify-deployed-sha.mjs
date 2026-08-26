#!/usr/bin/env node
// B-203 — post-deploy verification: proves the artifact `wrangler pages deploy` just
// published actually carries the commit CI verified, not just that the deploy command
// returned 0 (that's exactly the class of bug B-198 was: pipeline green, nothing changed
// for users). Polls the live site's `index` chunk for `main.tsx`'s
// `__PATCHES_WEB__:{version:"<pkg version>+<short sha>"}` stamp (see vite.config.ts's
// `buildVersion()`) and compares the short sha against the commit this job just deployed.
//
// Cloudflare Pages propagation is not instant, so a single fetch right after `wrangler
// pages deploy` returns can observe the previous deployment. This polls with a bounded
// timeout instead of a blind sleep, and reports which of three distinct failure modes it
// hit: the site never became reachable, the chunk was reachable but never parseable, or it
// was reachable and parseable but kept reporting an older sha until the timeout.
import { setTimeout as delay } from 'node:timers/promises';

const deployUrl = process.env['VERIFY_DEPLOY_URL'] ?? 'https://patches-web.pages.dev/';
const targetSha = process.env['TARGET_SHA'];
const timeoutMs = Number(process.env['VERIFY_TIMEOUT_MS'] ?? '180000');
const pollIntervalMs = Number(process.env['VERIFY_POLL_INTERVAL_MS'] ?? '15000');

if (!targetSha) {
  console.error('verify-deployed-sha — TARGET_SHA is not set.');
  process.exit(1);
}
const targetShort = targetSha.trim().slice(0, 7);

/** @typedef {{ kind: 'network' | 'unparseable' | 'stale'; detail: string }} Attempt */

/**
 * Fetches `url` bypassing intermediate caches — the root document changes on every deploy,
 * so a cached response would defeat the whole point of polling.
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
 * Finds the entry (`index`) chunk's script `src` in the deployed HTML. Vite's HTML plugin
 * emits exactly one `<script type="module">` tag for the entry chunk — every other bundle
 * reference in the document is a `<link rel="modulepreload">`.
 * @param {string} html
 * @returns {string | null}
 */
function findIndexChunkSrc(html) {
  const match = /<script[^>]*type="module"[^>]*\ssrc="([^"]+)"/.exec(html);
  return match ? match[1] : null;
}

/**
 * Extracts the short sha embedded by `main.tsx`'s `window.__PATCHES_WEB__` stamp. The
 * minifier is free to choose the quote style (seen in practice: backticks), so match any of
 * `"`/`'`/`` ` ``.
 * @param {string} chunkSource
 * @returns {string | null}
 */
function extractDeployedSha(chunkSource) {
  const match = /__PATCHES_WEB__:\{version:[`'"]([^`'"]*)[`'"]/.exec(chunkSource);
  if (!match) return null;
  const version = match[1];
  const plusIndex = version.lastIndexOf('+');
  return plusIndex === -1 ? '' : version.slice(plusIndex + 1);
}

async function main() {
  const start = Date.now();
  /** @type {Attempt} */
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

    const chunkSrc = findIndexChunkSrc(html);
    if (!chunkSrc) {
      last = {
        kind: 'unparseable',
        detail: `no <script type="module"> entry tag found in ${deployUrl}`,
      };
      await delay(pollIntervalMs);
      continue;
    }
    const chunkUrl = new URL(chunkSrc, deployUrl).toString();

    let chunkSource;
    try {
      chunkSource = await fetchFresh(chunkUrl);
    } catch (err) {
      last = {
        kind: 'network',
        detail: `fetching index chunk ${chunkUrl}: ${/** @type {Error} */ (err).message}`,
      };
      await delay(pollIntervalMs);
      continue;
    }

    const deployedSha = extractDeployedSha(chunkSource);
    if (deployedSha === null) {
      last = {
        kind: 'unparseable',
        detail: `no __PATCHES_WEB__ version stamp found in ${chunkUrl}`,
      };
      await delay(pollIntervalMs);
      continue;
    }

    if (deployedSha === targetShort) {
      console.log(
        `verify-deployed-sha — ${chunkUrl} reports sha ${deployedSha}, matches deployed commit ` +
          `${targetShort} (attempt ${attempts}, ${Date.now() - start}ms).`,
      );
      return;
    }

    last = { kind: 'stale', detail: `${chunkUrl} reports sha ${deployedSha || '<empty>'}` };
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
      `verify-deployed-sha — could not parse a version stamp after ${elapsed}ms (${attempts} attempts): ` +
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
