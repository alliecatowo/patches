import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * B-153 regression tests for the deployed worker at `public/sw.js` (copied verbatim by
 * the build, so it is evaluated here against a mocked `self`/`caches`/`fetch`).
 */

interface FakeResponse {
  ok: boolean;
  status: number;
  url: string;
  clone(): FakeResponse;
}

function response(status: number): FakeResponse {
  const r: FakeResponse = {
    ok: status >= 200 && status < 300,
    status,
    url: 'https://patches.example/',
    clone(): FakeResponse {
      return r;
    },
  };
  return r;
}

interface FakeRequest {
  method: string;
  mode?: string;
  url: string;
}

class FakeCache {
  readonly entries = new Map<string, FakeResponse>();
  match(request: FakeRequest | string): Promise<FakeResponse | undefined> {
    const url = typeof request === 'string' ? request : request.url;
    return Promise.resolve(this.entries.get(url));
  }
  put(request: FakeRequest | string, r: FakeResponse): Promise<void> {
    const url = typeof request === 'string' ? request : request.url;
    this.entries.set(url, r);
    return Promise.resolve();
  }
}

interface Harness {
  /** Runs the worker's `fetch` handler for `request`; resolves to the response passed to
   * `respondWith`, or `undefined` when the worker let the request pass through. */
  handle(request: FakeRequest): Promise<FakeResponse | undefined>;
  cache: FakeCache;
  fetchMock: ReturnType<typeof vi.fn>;
}

function loadWorker(fetchImpl: (request: FakeRequest) => Promise<FakeResponse>): Harness {
  // Vitest serves jsdom modules over http:// (import.meta.url is not a file URL), and
  // the test always runs from the @patches/web package root, so resolve from cwd.
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const cache = new FakeCache();
  const cachesApi = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue([]),
    // Real CacheStorage resolves relative match() keys against the worker's origin and
    // accepts Request objects; the worker passes both shapes.
    match: (key: string | FakeRequest) =>
      cache.match(typeof key === 'string' ? new URL(key, 'https://patches.example').href : key),
  };
  const fetchMock = vi.fn(fetchImpl);
  const workerSelf: Record<string, unknown> = {
    location: { origin: 'https://patches.example' },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    addEventListener: (name: string, fn: (event: unknown) => void) => {
      const list = listeners.get(name) ?? [];
      list.push(fn);
      listeners.set(name, list);
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- evaluating the shipped worker file, not dynamic behavior
  const run = new Function('self', 'caches', 'fetch', source) as (
    self: Record<string, unknown>,
    caches: unknown,
    fetch: unknown,
  ) => void;
  run(workerSelf, cachesApi, fetchMock);

  const fetchHandler = listeners.get('fetch')?.[0];
  if (fetchHandler === undefined) throw new Error('sw.js did not register a fetch handler');

  return {
    cache,
    fetchMock,
    handle(request: FakeRequest): Promise<FakeResponse | undefined> {
      return new Promise((resolve, reject) => {
        let responded = false;
        const event = {
          request,
          waitUntil: () => undefined,
          respondWith: (p: Promise<FakeResponse | undefined>) => {
            responded = true;
            p.then(resolve, reject);
          },
        };
        fetchHandler(event);
        // The worker calls respondWith synchronously for requests it handles; if it
        // returned without doing so, the request passes through to the network.
        if (!responded) resolve(undefined);
      });
    },
  };
}

function navigate(path = '/'): FakeRequest {
  return { method: 'GET', mode: 'navigate', url: `https://patches.example${path}` };
}

describe('sw.js fetch handler', () => {
  it('serves navigations from the network when it answers ok', async () => {
    const network = response(200);
    const harness = loadWorker(() => Promise.resolve(network));
    await expect(harness.handle(navigate())).resolves.toBe(network);
  });

  it('falls back to the cached shell when the network fails', async () => {
    const cached = response(200);
    const harness = loadWorker(() => Promise.reject(new Error('offline')));
    harness.cache.entries.set('https://patches.example/index.html', cached);
    await expect(harness.handle(navigate())).resolves.toBe(cached);
    expect(harness.fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back to the cached shell when the deploy answers an error page (B-153)', async () => {
    // `fetch` resolves for 404/5xx — the old handler served the error page verbatim and
    // bricked the app during deploy churn even with a good shell in the cache.
    const cached = response(200);
    const harness = loadWorker(() => Promise.resolve(response(503)));
    harness.cache.entries.set('https://patches.example/index.html', cached);
    await expect(harness.handle(navigate())).resolves.toBe(cached);
  });

  it('never touches API or gRPC requests', async () => {
    const harness = loadWorker(() => Promise.resolve(response(200)));
    await expect(
      harness.handle({
        method: 'GET',
        url: 'https://patches.example/patches.v1.TimelineService/ListHomeTimeline',
      }),
    ).resolves.toBeUndefined();
    await expect(
      harness.handle({ method: 'POST', url: 'https://patches.example/api/x' }),
    ).resolves.toBeUndefined();
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it('serves cached build assets cache-first', async () => {
    const cached = response(200);
    const harness = loadWorker(() => Promise.resolve(response(200)));
    harness.cache.entries.set('https://patches.example/assets/index-OLD.js', cached);
    await expect(
      harness.handle({ method: 'GET', url: 'https://patches.example/assets/index-OLD.js' }),
    ).resolves.toBe(cached);
  });
});
