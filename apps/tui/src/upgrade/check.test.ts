import { describe, expect, it, vi } from 'vitest';

import { checkForUpgrade, createMemoryUpgradeCache, isUpgradeCheckEnabled } from './check.js';

interface Release {
  tag_name: string;
  draft: boolean;
  assets: { name: string; browser_download_url: string }[];
}

function release(tag: string, opts: { draft?: boolean; asset?: boolean } = {}): Release {
  return {
    tag_name: tag,
    draft: opts.draft ?? false,
    assets:
      opts.asset === false
        ? []
        : [
            {
              name: `patches-social-${tag.replace(/^v/, '')}.tgz`,
              browser_download_url: `https://example.test/${tag}.tgz`,
            },
          ],
  };
}

function fakeFetch(status: number, body: unknown): typeof globalThis.fetch {
  return vi.fn(async () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => Promise.resolve(body),
    }),
  ) as unknown as typeof globalThis.fetch;
}

describe('checkForUpgrade', () => {
  it('returns undefined and never throws when the current version is already the newest', async () => {
    const fetchFn = fakeFetch(200, [release('v0.1.0-alpha.2')]);
    const result = await checkForUpgrade({
      currentVersion: '0.1.0-alpha.2',
      fetch: fetchFn,
      cache: createMemoryUpgradeCache(),
    });
    expect(result).toBeUndefined();
  });

  it('picks the newest non-draft release with a patches-social tarball asset', async () => {
    const fetchFn = fakeFetch(200, [
      release('v0.1.0-alpha.3'),
      release('v0.1.0-alpha.4', { draft: true }),
      release('v0.1.0-alpha.1'),
    ]);
    const result = await checkForUpgrade({
      currentVersion: '0.1.0-alpha.2',
      fetch: fetchFn,
      cache: createMemoryUpgradeCache(),
    });
    expect(result).toEqual({
      latestTag: 'v0.1.0-alpha.3',
      latestVersion: '0.1.0-alpha.3',
      assetUrl: 'https://example.test/v0.1.0-alpha.3.tgz',
    });
  });

  it('skips a release with no matching asset', async () => {
    const fetchFn = fakeFetch(200, [release('v0.1.0-alpha.3', { asset: false })]);
    const result = await checkForUpgrade({
      currentVersion: '0.1.0-alpha.2',
      fetch: fetchFn,
      cache: createMemoryUpgradeCache(),
    });
    expect(result).toBeUndefined();
  });

  it('silently resolves undefined on a network failure and reports it only via onDebug', async () => {
    const fetchFn = vi.fn(async () =>
      Promise.reject(new Error('getaddrinfo ENOTFOUND')),
    ) as unknown as typeof globalThis.fetch;
    const onDebug = vi.fn();
    const result = await checkForUpgrade({
      currentVersion: '0.1.0-alpha.2',
      fetch: fetchFn,
      cache: createMemoryUpgradeCache(),
      onDebug,
    });
    expect(result).toBeUndefined();
    expect(onDebug).toHaveBeenCalledTimes(1);
  });

  it('silently resolves undefined on a non-2xx response', async () => {
    const fetchFn = fakeFetch(403, { message: 'rate limited' });
    const onDebug = vi.fn();
    const result = await checkForUpgrade({
      currentVersion: '0.1.0-alpha.2',
      fetch: fetchFn,
      cache: createMemoryUpgradeCache(),
      onDebug,
    });
    expect(result).toBeUndefined();
    expect(onDebug).toHaveBeenCalledTimes(1);
  });

  it('serves a fresh cache entry without calling fetch again', async () => {
    const fetchFn = fakeFetch(200, [release('v0.1.0-alpha.3')]);
    const cache = createMemoryUpgradeCache();
    let clock = 1_000_000;
    const now = (): number => clock;

    const first = await checkForUpgrade({
      currentVersion: '0.1.0-alpha.2',
      fetch: fetchFn,
      cache,
      now,
    });
    expect(first?.latestVersion).toBe('0.1.0-alpha.3');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clock += 60_000; // one minute later, well inside the 6h window
    const second = await checkForUpgrade({
      currentVersion: '0.1.0-alpha.2',
      fetch: fetchFn,
      cache,
      now,
    });
    expect(second?.latestVersion).toBe('0.1.0-alpha.3');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('re-checks once the 6h cache window has elapsed', async () => {
    const fetchFn = fakeFetch(200, [release('v0.1.0-alpha.3')]);
    const cache = createMemoryUpgradeCache();
    let clock = 1_000_000;
    const now = (): number => clock;

    await checkForUpgrade({ currentVersion: '0.1.0-alpha.2', fetch: fetchFn, cache, now });
    clock += 6 * 60 * 60 * 1000 + 1;
    await checkForUpgrade({ currentVersion: '0.1.0-alpha.2', fetch: fetchFn, cache, now });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('a cached "nothing newer" answer still re-evaluates against a changed current version', async () => {
    const fetchFn = fakeFetch(200, [release('v0.1.0-alpha.3')]);
    const cache = createMemoryUpgradeCache();
    const now = (): number => 1_000_000;

    // First check: already on the latest, cache stores the release info but "nothing to offer".
    const upToDate = await checkForUpgrade({
      currentVersion: '0.1.0-alpha.3',
      fetch: fetchFn,
      cache,
      now,
    });
    expect(upToDate).toBeUndefined();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // A launch moments later (still within the cache window) with an *older* recorded
    // current version (e.g. a stale build) should still surface the cached release as newer,
    // without a second network call.
    const stillCached = await checkForUpgrade({
      currentVersion: '0.1.0-alpha.2',
      fetch: fetchFn,
      cache,
      now,
    });
    expect(stillCached?.latestVersion).toBe('0.1.0-alpha.3');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('force bypasses the cache-freshness check but still writes a fresh entry', async () => {
    const fetchFn = fakeFetch(200, [release('v0.1.0-alpha.3')]);
    const cache = createMemoryUpgradeCache();
    const now = (): number => 1_000_000;

    await checkForUpgrade({ currentVersion: '0.1.0-alpha.2', fetch: fetchFn, cache, now });
    await checkForUpgrade({
      currentVersion: '0.1.0-alpha.2',
      fetch: fetchFn,
      cache,
      now,
      force: true,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('aborts the request once the timeout elapses', async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof globalThis.fetch;

    const result = await checkForUpgrade({
      currentVersion: '0.1.0-alpha.2',
      fetch: fetchFn,
      cache: createMemoryUpgradeCache(),
      timeoutMs: 5,
    });
    expect(result).toBeUndefined();
  });
});

describe('isUpgradeCheckEnabled', () => {
  it('is enabled by default', () => {
    expect(isUpgradeCheckEnabled({}, false)).toBe(true);
  });

  it('is disabled by the --no-upgrade-check flag', () => {
    expect(isUpgradeCheckEnabled({}, true)).toBe(false);
  });

  it('is disabled by PATCHES_NO_UPGRADE_CHECK', () => {
    expect(isUpgradeCheckEnabled({ PATCHES_NO_UPGRADE_CHECK: '1' }, false)).toBe(false);
  });

  it('is disabled under CI', () => {
    expect(isUpgradeCheckEnabled({ CI: 'true' }, false)).toBe(false);
  });
});
