/**
 * Register the Service Worker in production / supported browser environments.
 */

/**
 * B-153: the worker updates silently (`skipWaiting` + `clients.claim` in sw.js), and the
 * `patches:sw-updated` event this module dispatches had no listener — so a tab opened
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

export function registerServiceWorker(): void {
  // An explicit development escape hatch keeps a stale production worker from intercepting a
  // Vite visual/debug session. It is compiled away from production builds unless deliberately
  // set there, and deployment configuration never sets this value.
  if (import.meta.env.DEV && import.meta.env['VITE_PATCHES_DISABLE_SERVICE_WORKER'] === '1') {
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
                window.dispatchEvent(new CustomEvent('patches:sw-updated'));
                navigator.serviceWorker.addEventListener(
                  'controllerchange',
                  reloadOnceOnControllerChange,
                );
              }
            });
          }
        });
      })
      .catch(() => {
        // Registration failed (e.g. unsupported host) — fail silent
      });
  });
}
