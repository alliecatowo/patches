import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * B-153 regression tests for the Workbox service worker (`src/pwa/sw.ts`) that
 * vite-plugin-pwa builds to `dist/sw.js`.
 *
 * The shipped worker only exists after a build (the plugin injects the precache
 * manifest into it), so evaluating a generated file like the old hand-rolled
 * `public/sw.js` tests did is not possible here. Instead these tests import the
 * actual module with the ServiceWorker globals stubbed (`caches`, `fetch`,
 * `skipWaiting`, `clients`, `__WB_MANIFEST`) and drive the real workbox routing
 * through the `install`/`activate`/`fetch` listeners it registers on `self` —
 * the same events a real browser would fire.
 */

/** Manifest entries the injected `self.__WB_MANIFEST` is stubbed with: the shell
 * (content-revisioned, like the built index.html) and one hashed asset
 * (revision-less, like everything under /assets/). */
const SHELL_ENTRY = { url: '/index.html', revision: 'r1' };
const ASSET_ENTRY = '/assets/index-OLD.js';

/** jsdom has neither `ExtendableEvent` nor `FetchEvent`, but workbox's dev-mode
 * asserts (`options.event instanceof ExtendableEvent`, `options instanceof
 * FetchEvent`) reference the globals and require real instances. These stubs are
 * installed as those globals for the harness's lifetime. */
class StubExtendableEvent extends Event {
  readonly pending: Promise<unknown>[] = [];

  waitUntil(promise: Promise<unknown>): void {
    this.pending.push(promise);
  }
}

class StubFetchEvent extends StubExtendableEvent {
  constructor(
    request: Request,
    private readonly onRespondWith: (promise: Promise<Response>) => void,
  ) {
    super('fetch');
    this.request = request;
  }

  readonly request: Request;

  respondWith(promise: Promise<Response>): void {
    this.onRespondWith(promise);
  }
}

/** A real service worker resolves relative `new Request('/index.html')` against its
 * own location; Node's undici rejects relative URLs outright. Workbox relies on the
 * browser behavior (`createHandlerBoundToURL`), so the harness installs this
 * location-resolving subclass as the global Request. */
class LocationRelativeRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' ? new URL(input, window.location.href).href : input, init);
  }
}

class FakeCache {
  readonly entries = new Map<string, Response>();

  match(key: string | Request): Promise<Response | undefined> {
    return Promise.resolve(this.entries.get(typeof key === 'string' ? key : key.url));
  }

  put(key: string | Request, response: Response): Promise<void> {
    this.entries.set(typeof key === 'string' ? key : key.url, response);
    return Promise.resolve();
  }

  keys(): Promise<Request[]> {
    return Promise.resolve([...this.entries.keys()].map((url) => new Request(url)));
  }

  delete(key: string | Request): Promise<boolean> {
    return Promise.resolve(this.entries.delete(typeof key === 'string' ? key : key.url));
  }

  // Below: required by the `Cache` interface, unused by workbox's precache flow.
  add(request: RequestInfo): Promise<void> {
    return fetch(request).then((response) => this.put(request, response));
  }

  addAll(requests: RequestInfo[]): Promise<void> {
    return Promise.all(requests.map((request) => this.add(request))).then(() => undefined);
  }

  matchAll(): Promise<Response[]> {
    return Promise.resolve([...this.entries.values()]);
  }
}

function createCaches(): CacheStorage & { store: Map<string, FakeCache> } {
  const store = new Map<string, FakeCache>();
  const open = (name: string): Promise<Cache> => {
    let cache = store.get(name);
    if (cache === undefined) {
      cache = new FakeCache();
      store.set(name, cache);
    }
    return Promise.resolve(cache as Cache);
  };
  return {
    store,
    open,
    has: (name: string): Promise<boolean> => Promise.resolve(store.has(name)),
    keys: (): Promise<string[]> => Promise.resolve([...store.keys()]),
    delete: (name: string): Promise<boolean> => Promise.resolve(store.delete(name)),
    match: async (
      key: string | Request,
      options?: { cacheName?: string },
    ): Promise<Response | undefined> => {
      const cachesToSearch =
        options?.cacheName !== undefined && store.has(options.cacheName)
          ? [store.get(options.cacheName) as FakeCache]
          : [...store.values()];
      for (const cache of cachesToSearch) {
        const hit = await cache.match(key);
        if (hit !== undefined) return hit;
      }
      return undefined;
    },
  };
}

/** jsdom is `self` for the worker module, but bare global identifiers used inside
 * workbox resolve against globalThis — stub both surfaces. */
function stubWorkerGlobal(name: string, value: unknown): void {
  vi.stubGlobal(name, value);
  Object.defineProperty(window, name, { value, configurable: true, writable: true });
}

interface Harness {
  /** Resolves to the response passed to `respondWith`, or `undefined` when the
   * worker let the request pass through to the network. */
  handle(request: Request): Promise<Response | undefined>;
  /** Runs every captured `install` listener to completion (populates the precache). */
  install(): Promise<void>;
  /** Runs every captured `activate` listener to completion. */
  activate(): Promise<void>;
  caches: CacheStorage & { store: Map<string, FakeCache> };
  fetchMock: ReturnType<typeof vi.fn>;
  skipWaiting: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
}

async function loadWorker(fetchImpl: (request: Request) => Promise<Response>): Promise<Harness> {
  const fetchMock = vi.fn(fetchImpl);
  const cachesFake = createCaches();
  const skipWaiting = vi.fn(() => Promise.resolve());
  const claim = vi.fn(() => Promise.resolve());
  stubWorkerGlobal('fetch', fetchMock);
  stubWorkerGlobal('caches', cachesFake);
  stubWorkerGlobal('skipWaiting', skipWaiting);
  stubWorkerGlobal('clients', { claim });
  stubWorkerGlobal('__WB_MANIFEST', [SHELL_ENTRY, ASSET_ENTRY]);
  stubWorkerGlobal('ExtendableEvent', StubExtendableEvent);
  stubWorkerGlobal('FetchEvent', StubFetchEvent);
  // cleanupOutdatedCaches() reads self.registration.scope; in a real worker the
  // registration's scope is the app origin, so mirror that here.
  stubWorkerGlobal('registration', { scope: `${window.location.origin}/` });
  stubWorkerGlobal('Request', LocationRelativeRequest);
  stubWorkerGlobal('FetchEvent', class FetchEvent extends Event {});

  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const addSpy = vi.spyOn(window, 'addEventListener');
  vi.resetModules();
  try {
    await import('./sw.js');
  } finally {
    for (const [name, handler] of addSpy.mock.calls) {
      if (name === 'install' || name === 'activate' || name === 'fetch') {
        const list = listeners.get(name) ?? [];
        list.push(handler as (event: unknown) => void);
        listeners.set(name, list);
      }
    }
    addSpy.mockRestore();
  }
  if ((listeners.get('fetch')?.length ?? 0) === 0) {
    throw new Error('sw.ts did not register a fetch handler');
  }

  function fireLifecycle(type: 'install' | 'activate'): Promise<void> {
    const event = new StubExtendableEvent(type);
    for (const listener of listeners.get(type) ?? []) listener(event);
    return Promise.all(event.pending).then(() => undefined);
  }

  return {
    caches: cachesFake,
    fetchMock,
    skipWaiting,
    claim,
    install: () => fireLifecycle('install'),
    activate: () => fireLifecycle('activate'),
    handle(request: Request): Promise<Response | undefined> {
      return new Promise((resolve, reject) => {
        let responded = false;
        const event = new StubFetchEvent(request, (promise) => {
          responded = true;
          promise.then(resolve, reject);
        });
        for (const listener of listeners.get('fetch') ?? []) listener(event);
        // The router calls respondWith synchronously for requests it handles; if it
        // returned without doing so, the request passes through to the network.
        if (!responded) resolve(undefined);
      });
    },
  };
}

const ORIGIN = window.location.origin;

const SHELL_URL = `${ORIGIN}/index.html`;
const ASSET_URL = `${ORIGIN}/assets/index-OLD.js`;

/** `install()` fetches every manifest entry (shell + asset); route those to `ok`,
 * everything else to `navigations`. */
function installThen(
  navigations: (request: Request) => Promise<Response>,
  ok: (request: Request) => Promise<Response> = (request) =>
    Promise.resolve(response(200, request.url === SHELL_URL ? '<cached shell>' : 'asset')),
): (request: Request) => Promise<Response> {
  return (request) =>
    request.url === SHELL_URL || request.url === ASSET_URL ? ok(request) : navigations(request);
}

function navigate(path = '/'): Request {
  // Node's Request rejects `mode: 'navigate'` at construction; shadow the prototype
  // getter with an own property — workbox only reads `request.mode`.
  const request = new Request(`${ORIGIN}${path}`);
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  return request;
}

function get(path: string): Request {
  return new Request(`${ORIGIN}${path}`);
}

function response(status: number, body = ''): Response {
  return new Response(body, { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of [
    'fetch',
    'caches',
    'skipWaiting',
    'clients',
    '__WB_MANIFEST',
    'ExtendableEvent',
    'FetchEvent',
    'registration',
    'Request',
  ]) {
    delete (window as Partial<typeof window> & Record<string, unknown>)[name];
  }
});

describe('sw.ts (vite-plugin-pwa injectManifest worker)', () => {
  it('serves navigations from the network when it answers ok', async () => {
    const network = response(200, '<fresh shell>');
    const harness = await loadWorker(() => Promise.resolve(network));
    await harness.install();
    await expect(harness.handle(navigate())).resolves.toBe(network);
  });

  it('falls back to the cached shell when the network fails', async () => {
    const harness = await loadWorker(installThen(() => Promise.reject(new Error('offline'))));
    await harness.install();
    const served = await harness.handle(navigate());
    // The precached shell comes back as a clone of the install-time response.
    expect(served?.status).toBe(200);
    expect(await served?.text()).toBe('<cached shell>');
    expect(harness.fetchMock).toHaveBeenCalledTimes(3);
  });

  it('falls back to the cached shell when the deploy answers an error page (B-153)', async () => {
    // `fetch` resolves for 404/5xx — Workbox's stock NetworkFirst would return the
    // error page verbatim; the custom navigation handler must fall back instead.
    const harness = await loadWorker(
      installThen(() => Promise.resolve(response(503, 'deploy churn'))),
    );
    await harness.install();
    const served = await harness.handle(navigate());
    expect(served?.status).toBe(200);
    expect(await served?.text()).toBe('<cached shell>');
  });

  it('never touches API or gRPC requests', async () => {
    const harness = await loadWorker(() => Promise.resolve(response(200)));
    await harness.install();
    const callsBeforeRpc = harness.fetchMock.mock.calls.length;
    await expect(
      harness.handle(get('/patches.v1.TimelineService/ListHomeTimeline')),
    ).resolves.toBeUndefined();
    await expect(
      harness.handle(new Request(`${ORIGIN}/api/x`, { method: 'POST' })),
    ).resolves.toBeUndefined();
    // Navigations to API paths pass through too (the denylist half of the matcher).
    await expect(harness.handle(navigate('/api/x'))).resolves.toBeUndefined();
    expect(harness.fetchMock).toHaveBeenCalledTimes(callsBeforeRpc);
  });

  it('serves precached build assets cache-first', async () => {
    const harness = await loadWorker(installThen(() => Promise.resolve(response(200))));
    await harness.install();
    const callsAfterInstall = harness.fetchMock.mock.calls.length;
    const served = await harness.handle(get('/assets/index-OLD.js'));
    expect(served?.status).toBe(200);
    expect(await served?.text()).toBe('asset');
    expect(harness.fetchMock).toHaveBeenCalledTimes(callsAfterInstall);
  });

  it('updates silently: skipWaiting on install, claim + legacy cache cleanup on activate', async () => {
    const harness = await loadWorker(() => Promise.resolve(response(200)));
    // The pre-B-156 hand-rolled worker's cache must not survive activation.
    harness.caches.store.set('patches-shell-v2', new FakeCache());
    await harness.install();
    expect(harness.skipWaiting).toHaveBeenCalled();
    await harness.activate();
    expect(harness.claim).toHaveBeenCalled();
    expect([...harness.caches.store.keys()]).not.toContain('patches-shell-v2');
  });
});
