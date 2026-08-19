import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import { isTruthy } from '../env.js';
import { compareVersions, parseVersion } from './semver.js';

/** What a newer GitHub release looks like once picked out of the releases API response. */
export interface UpgradeInfo {
  /** The raw git tag, e.g. `v0.1.0-alpha.3`. */
  latestTag: string;
  /** The tag with its leading `v` stripped, e.g. `0.1.0-alpha.3` — comparable with `TUI_VERSION`. */
  latestVersion: string;
  /** Direct download URL for the `patches-social-*.tgz` release asset. */
  assetUrl: string;
}

interface UpgradeCacheEntry {
  checkedAt: number;
  /** `null` means "checked, found nothing usable" — distinct from "never checked" (a missing file). */
  latest: UpgradeInfo | null;
}

export interface UpgradeCache {
  read(): UpgradeCacheEntry | undefined;
  write(entry: UpgradeCacheEntry): void;
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const DEFAULT_REPO = 'alliecatowo/patches';
const ASSET_NAME_PATTERN = /^patches-social-.*\.tgz$/;

const upgradeInfoSchema = z.object({
  latestTag: z.string(),
  latestVersion: z.string(),
  assetUrl: z.string(),
});

const cacheEntrySchema = z.object({
  checkedAt: z.number(),
  latest: z.union([upgradeInfoSchema, z.null()]),
});

const releaseAssetSchema = z.object({
  name: z.string(),
  browser_download_url: z.string(),
});

const releaseSchema = z.object({
  tag_name: z.string(),
  draft: z.boolean(),
  assets: z.array(releaseAssetSchema),
});

const releasesSchema = z.array(releaseSchema);

/** `$XDG_CACHE_HOME/patches/upgrade-check.json`, falling back to `~/.cache/patches/...`. */
export function defaultUpgradeCachePath(env: NodeJS.ProcessEnv = process.env): string {
  const xdgCacheHome = env.XDG_CACHE_HOME?.trim();
  const cacheDir =
    xdgCacheHome !== undefined && xdgCacheHome !== '' ? xdgCacheHome : join(homedir(), '.cache');
  return join(cacheDir, 'patches', 'upgrade-check.json');
}

/**
 * A disk-backed cache — advisory only. Any read/write failure (missing file, invalid JSON,
 * read-only home directory) is swallowed and treated as "no cache", never surfaced to the user;
 * losing this cache just means the next launch re-checks instead of waiting out the 6h window.
 */
export function createFileUpgradeCache(path: string = defaultUpgradeCachePath()): UpgradeCache {
  return {
    read(): UpgradeCacheEntry | undefined {
      try {
        const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
        const parsed = cacheEntrySchema.safeParse(raw);
        return parsed.success ? parsed.data : undefined;
      } catch {
        // Missing file or invalid JSON — treat as never-checked, not an error.
        return undefined;
      }
    },
    write(entry: UpgradeCacheEntry): void {
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(entry), 'utf8');
      } catch {
        // Best-effort cache — never let a write failure surface to the user.
      }
    },
  };
}

/** An in-memory cache for tests and for the forced, non-interactive `patches upgrade` path
 * (which must always hit the network, but should still leave a fresh disk cache behind for the
 * next normal launch — call sites pass the disk cache there, this is for unit tests only). */
export function createMemoryUpgradeCache(): UpgradeCache {
  let entry: UpgradeCacheEntry | undefined;
  return {
    read: () => entry,
    write: (next) => {
      entry = next;
    },
  };
}

export interface CheckForUpgradeOptions {
  /** `TUI_VERSION` — what we're comparing releases against. */
  currentVersion: string;
  fetch: typeof globalThis.fetch;
  /** Abort the network request after this long. Default 2500ms. */
  timeoutMs?: number;
  cache: UpgradeCache;
  /** Skips the 6h cache-freshness check but still writes a fresh cache entry — used by the
   * `patches upgrade` command, which is an explicit, non-interactive request to check now. */
  force?: boolean;
  now?: () => number;
  /** GitHub `owner/repo`. Default `alliecatowo/patches`. */
  repo?: string;
  /** Called with a short diagnostic when the check could not complete (network error, timeout,
   * non-2xx response) — never on a clean "nothing newer" result. Normal launches only wire this
   * up when `--verbose`/`PATCHES_DEBUG` is set; it must never be used to print in the common case. */
  onDebug?: (message: string) => void;
}

/**
 * Checks GitHub Releases for a newer `patches-social` build than `currentVersion`.
 *
 * Never throws: a network failure, timeout, or unparseable response resolves to `undefined`,
 * exactly like "nothing newer available" — a broken/offline network must never block or noisily
 * interrupt launching the TUI. Callers that want to know *why* nothing came back (the `patches
 * upgrade` command) pass `onDebug` and use "was it called" to distinguish that from a clean check.
 */
export async function checkForUpgrade(
  options: CheckForUpgradeOptions,
): Promise<UpgradeInfo | undefined> {
  const now = options.now ?? Date.now;
  const nowMs = now();

  if (options.force !== true) {
    const cached = options.cache.read();
    if (cached !== undefined && nowMs - cached.checkedAt < SIX_HOURS_MS) {
      return pickIfNewer(cached.latest ?? undefined, options.currentVersion);
    }
  }

  const timeoutMs = options.timeoutMs ?? 2500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const repo = options.repo ?? DEFAULT_REPO;
    const response = await options.fetch(`https://api.github.com/repos/${repo}/releases`, {
      signal: controller.signal,
      headers: { accept: 'application/vnd.github+json' },
    });

    if (!response.ok) {
      options.onDebug?.(`GitHub releases request failed: HTTP ${response.status}`);
      options.cache.write({ checkedAt: nowMs, latest: null });
      return undefined;
    }

    const body: unknown = await response.json();
    const latest = pickLatestRelease(body) ?? null;
    options.cache.write({ checkedAt: nowMs, latest });
    return pickIfNewer(latest ?? undefined, options.currentVersion);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    options.onDebug?.(`upgrade check failed: ${message}`);
    // Deliberately not cached: a transient failure (e.g. a flaky network blip) shouldn't
    // suppress the next launch's retry the way a real "nothing newer" answer does.
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function pickIfNewer(
  latest: UpgradeInfo | undefined,
  currentVersion: string,
): UpgradeInfo | undefined {
  if (latest === undefined) return undefined;
  if (
    parseVersion(latest.latestVersion) === undefined ||
    parseVersion(currentVersion) === undefined
  ) {
    return undefined;
  }
  return compareVersions(latest.latestVersion, currentVersion) > 0 ? latest : undefined;
}

function pickLatestRelease(body: unknown): UpgradeInfo | undefined {
  const parsed = releasesSchema.safeParse(body);
  if (!parsed.success) return undefined;

  let best: UpgradeInfo | undefined;
  for (const release of parsed.data) {
    if (release.draft) continue;
    const latestVersion = release.tag_name.replace(/^v/, '');
    if (parseVersion(latestVersion) === undefined) continue;
    const asset = release.assets.find((candidate) => ASSET_NAME_PATTERN.test(candidate.name));
    if (asset === undefined) continue;
    if (best === undefined || compareVersions(latestVersion, best.latestVersion) > 0) {
      best = { latestTag: release.tag_name, latestVersion, assetUrl: asset.browser_download_url };
    }
  }
  return best;
}

/** `--no-upgrade-check` / `PATCHES_NO_UPGRADE_CHECK` / `CI` gate — checked by the caller before
 * ever constructing a `checkForUpgrade` call, so a disabled check costs nothing at all. */
export function isUpgradeCheckEnabled(
  env: NodeJS.ProcessEnv,
  noUpgradeCheckFlag: boolean,
): boolean {
  if (noUpgradeCheckFlag) return false;
  if (isTruthy(env.PATCHES_NO_UPGRADE_CHECK)) return false;
  if (isTruthy(env.CI)) return false;
  return true;
}
