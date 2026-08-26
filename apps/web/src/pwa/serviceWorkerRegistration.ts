/**
 * Register the Workbox service worker that vite-plugin-pwa builds into `dist/sw.js`.
 */

/**
 * B-153: the worker updates silently (`skipWaiting` + `clients.claim` in sw.ts), and
 * a `patches:sw-updated` event was never listened to by anyone — so a tab opened
 * before a deploy kept running the pre-deploy bundle against the new server until the
 * user manually reloaded (the partner's "timeline dead until sign-out/in" was exactly
 * that: a full reload, not the auth flow, is what fixed it). When an updated worker has
 * finished installing while this page is already controlled, reload once on takeover so
 * the fresh shell+bundle load deterministically. Never armed on first install (no
 * previous controller means `clients.claim()` would otherwise reload the very first
 * page load), and the flag guarantees a single reload per page lifetime even if an
 * engine fires `controllerchange` twice or a second deploy lands in the same session.
 */
let takeoverReloadDone = false;

function reloadOnceOnControllerChange(): void {
  if (takeoverReloadDone) return;
  takeoverReloadDone = true;
  window.location.reload();
}

/**
 * B-202 (owner-reported, 2026-08-26): the reload-on-takeover flow above only ever
 * fires once an update has actually been *detected* (`registration`'s `updatefound`
 * event) — and per the Service Worker spec's update algorithm, the browser only
 * checks for a new worker byte-diff on a full navigation to a page in scope, an
 * explicit `registration.update()` call, or its own coarse (up to ~24h) background
 * timer. A single-page app never does a full navigation again after its first load —
 * React Router's client-side routing doesn't touch the network path that triggers a
 * browser-driven check — so a tab left open across a Cloudflare Pages redeploy (every
 * asset hash changes, §"Update lifecycle" in `docs/research/web-sw-caching.md`) can
 * sit on the pre-deploy bundle for up to a day with nothing in this module ever
 * looking for an update, let alone reloading. A full app restart "fixed" it only
 * because restarting always performs the full navigation the update check needs.
 *
 * Proactively re-checks instead of waiting on the browser's own schedule: once when
 * the tab regains visibility (the moment the owner would actually notice something's
 * wrong) and on a coarse interval while visible, so a long-lived, never-reloaded tab
 * converges on a redeploy within minutes instead of hours. `registration.update()` is
 * a no-op (resolves immediately) when the worker byte-for-byte matches what's already
 * installed, so this is safe to call liberally.
 */
const PROACTIVE_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

function scheduleProactiveUpdateChecks(registration: ServiceWorkerRegistration): void {
  const checkNow = (): void => {
    registration.update().catch(() => {
      // Offline, or the browser refused the check (e.g. an in-flight install) —
      // the next scheduled/visibility-triggered check will simply try again.
    });
  };

  // Runs once right away too — `register()` itself only forces a check the very
  // first time a scope is ever registered in a given browser profile; a later app
  // load against an already-registered scope doesn't re-check on its own.
  checkNow();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkNow();
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') checkNow();
  }, PROACTIVE_UPDATE_CHECK_INTERVAL_MS);
}

export function registerServiceWorker(): void {
  // vite-plugin-pwa builds the worker for production only (devOptions disabled), so
  // dev serves no /sw.js — registering there would only 404 and, worse, could let a
  // stale production worker intercept a Vite debug session.
  if (import.meta.env.DEV) {
    return;
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                navigator.serviceWorker.addEventListener(
                  'controllerchange',
                  reloadOnceOnControllerChange,
                );
              }
            });
          }
        });
        scheduleProactiveUpdateChecks(registration);
      })
      .catch(() => {
        // Registration failed (e.g. unsupported host) — fail silent
      });
  });
}
