/**
 * Patches service worker, built by vite-plugin-pwa (`strategies: 'injectManifest'`).
 *
 * vite-plugin-pwa compiles this module to `dist/sw.js` — so `/sw.js` keeps its
 * `no-store` header rule in `public/_headers` — and replaces the literal
 * `self.__WB_MANIFEST` below with the build's precache manifest (hashed
 * `/assets/*`, `index.html`, icons, and the web manifest, each content-revisioned).
 * Workbox serves those precache-first; nothing else is cached in v0.
 *
 * Why `injectManifest` and not `generateSW`: the B-153 navigation policy —
 * network-first with a cached-shell fallback on network failure AND on
 * `!response.ok` deploy-churn error pages — cannot be expressed with Workbox's
 * stock `NetworkFirst` (it returns a resolved non-ok response verbatim). Pinned by
 * `sw.behavior.test.ts`.
 */
import {
  addRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precache,
} from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';

/** Cache names used by the pre-B-156 hand-rolled worker (`patches-shell-*`); deleted
 * on activation so long-lived installs stop carrying dead caches. */
const LEGACY_SHELL_CACHE = /^patches-shell-/;

/** Connect gRPC and REST API paths — never matched by any caching route. */
const RPC_PATH = /^\/(?:api|patches\.v1\.)/;

/**
 * The app's tsconfig uses DOM libs, so `ServiceWorkerGlobalScope` and the worker
 * event types (which now live only in the webworker lib) aren't available; this is
 * the exact slice of the worker global this module touches. The manifest access
 * below stays a literal `self.__WB_MANIFEST` because that string is
 * vite-plugin-pwa's injection point in the built `dist/sw.js`.
 */
interface ExtendableWorkerEvent {
  waitUntil(promise: Promise<unknown>): void;
}

interface PwaWorkerGlobalScope {
  readonly caches: CacheStorage;
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(
    type: 'install' | 'activate',
    listener: (event: ExtendableWorkerEvent) => void,
  ): void;
}

const worker = self as unknown as PwaWorkerGlobalScope;
type PrecacheManifest = Parameters<typeof precache>[0];

// Silent updates (B-153): a new deploy's worker must not wait for old tabs to close,
// and takes over running pages immediately so the registration helper's one-shot
// `controllerchange` reload can load the fresh shell deterministically.
worker.addEventListener('install', (event) => {
  event.waitUntil(worker.skipWaiting());
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await worker.caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => LEGACY_SHELL_CACHE.test(name))
          .map((name) => worker.caches.delete(name)),
      );
      await worker.clients.claim();
    })(),
  );
});

// Drops precache caches from outdated Workbox versions (registers its own
// `activate` listener). `precache` adds the injected manifest to the controller and
// wires its install/activate lifecycle (populate + prune stale revisions — so stale
// shells disappear while content-hashed `/assets/*`, revision-less, persist for
// still-running old tabs).
cleanupOutdatedCaches();
precache(
  (self as unknown as PwaWorkerGlobalScope & { __WB_MANIFEST: PrecacheManifest }).__WB_MANIFEST,
);

/** B-153: prefer the network for every navigation; serve the precached shell when
 * the network fails OR resolves with a non-ok deploy-churn error page. */
const cachedShell = createHandlerBoundToURL('/index.html');

// Workbox routes are first-match-wins, so the navigation route must be registered
// BEFORE the precache route — otherwise the precache route's directoryIndex
// variation (`/` → `/index.html`) would swallow navigations and serve them
// cache-first.
registerRoute(
  ({ request, url }) => request.mode === 'navigate' && !RPC_PATH.test(url.pathname),
  async (options) => {
    try {
      const response = await fetch(options.request);
      if (response.ok) return response;
    } catch {
      // Offline — fall through to the precached shell below.
    }
    return cachedShell(options);
  },
);

// Cache-first route for the precached manifest (hashed assets, shell, icons).
addRoute();
