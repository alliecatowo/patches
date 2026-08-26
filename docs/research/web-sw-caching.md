# Web service worker & caching (B-153 diagnosis)

Investigated 2026-08-26 for B-153 ("web timeline dead until sign-out/in" after the
2026-08-25 multi-deploy session). Partner report, one-time occurrence.

## Where the moving parts live

| Piece                      | Path                                                                                         | Behaviour                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Worker (deployed verbatim) | `apps/web/public/sw.js`                                                                      | shell precache, network-first navigations, cache-first assets                |
| Registration               | `apps/web/src/pwa/serviceWorkerRegistration.ts`                                              | registers `/sw.js` on `window` load, watches `updatefound`                   |
| Cache headers              | `apps/web/public/_headers`                                                                   | `/sw.js` → `no-cache, no-store, must-revalidate`; `/index.html` → `no-cache` |
| Tests                      | `apps/web/src/pwa/sw.behavior.test.ts`, `apps/web/src/pwa/serviceWorkerRegistration.test.ts` | evaluate the shipped worker + registration against fakes                     |

## Update lifecycle (as of this writing)

1. The browser revalidates `/sw.js` on navigations (it is served `no-store`, so CDN/browser
   caching never delays an update for long).
2. On a byte-diff the new worker installs: `cache.addAll(PRECACHE_URLS)` refreshes `/` and
   `/index.html` inside the single long-lived `patches-shell-v2` cache, then calls
   `self.skipWaiting()` (`sw.js` install handler).
3. Activation deletes every _other_ `patches-shell-*` cache and calls
   `self.clients.claim()` — the new worker takes over the running page immediately.
4. The registration helper dispatches a `patches:sw-updated` `CustomEvent` on `window`
   when an installing worker reaches `installed` while a controller already exists.

Request handling: navigations are **network-first** (cached shell only on network
failure), `/api` + `/patches.v1.*` RPC traffic is **never cached or intercepted**, and
same-origin `/assets/*` + precached static files are **cache-first with background
revalidation**. Old hashed assets are never evicted from `patches-shell-v2`, so a cached
old shell can always find the old bundle it references.

## Hypotheses examined

### (a) Old SW served a stale index.html bootstrapping a bundle with an old API shape

**Ruled out as the direct cause while online.** Navigations are network-first
(`sw.js` fetch handler): whenever the timeline RPC could reach the server at all, the
shell came from the network too. The cached shell is only served when `fetch` _rejects_,
i.e. truly offline — and then the timeline RPC is equally dead, matching nothing about
the report. RPC traffic never touches the cache (`url.pathname.startsWith('/api') ||
startsWith('/patches.v1.')` early-return), so the SW cannot stale-serve timeline data.

**Gap found and fixed:** `fetch` _resolves_ for 4xx/5xx. During deploy churn (rollback
window, half-updated replica) the worker passed the deploy's 404/500 HTML error page
through verbatim and bricked the app even with a good shell in the cache. Fixed: fall
back to the cached shell on `!response.ok` as well.

### (b) Auth token rotated server-side; client only refreshes on full login

**Ruled out — the code already does the right thing.** Every RPC goes through
`authInterceptor` (`apps/web/src/api/client.ts:102`), which wraps calls in
`sessionManager.withSession`: on `Code.Unauthenticated` it refreshes the token once
(single-flight, `packages/client/src/session.ts:103`) and retries. A dead refresh token
clears the pair (`session.ts:120`) and the interceptor signs the UI out on
`Unauthenticated` (`client.ts:119`), so the app self-recovers to a signed-out state
rather than presenting a signed-in timeline that loop-fails. The report's "had to sign
out manually" implies the UI never flipped — consistent with a _non-auth_ RPC failure,
not this loop.

### (c) Hard-coded asset hashes 404 through the SW cache-first strategy

**Ruled out.** Old hashed assets persist forever in `patches-shell-v2` (activation
deletes other caches, never entries within the live one), so an old shell always finds
its old bundle. A _new_ shell's new hashes are cache misses fetched straight from the
network. A 404 would require the origin serving the shell to have lost that exact asset
(swept preview URLs) — but then network-first navigation would fail the same way, and
sign-out/in could not have fixed it. Not timeline-specific in any case.

## What actually explains B-153

**A long-lived tab/PWA window running the pre-deploy JS bundle against the
post-deploy server** (2026-08-25 churned several deploys). The SW updated silently —
`skipWaiting` + `clients.claim` took over with **no reload prompt**, because the
`patches:sw-updated` event was dispatched (`serviceWorkerRegistration.ts:24` at the
time) with **no listener anywhere in the codebase** (grep: single hit, the dispatch
site). The running page kept executing old code whose timeline fetch failed against the
new server shape; React Query rendered "Couldn't load this timeline"
(`PostTimeline.tsx:114`) and retrying kept failing. Sign-out/in fixed it only because it
forces a full page load: network-first navigation fetched the fresh shell + bundle.
One-time by nature — once reloaded, she was on the new bundle.

## Fixes shipped (this change)

1. `serviceWorkerRegistration.ts` — when an updated worker finishes installing while the
   page is already controlled, arm a one-shot `controllerchange` listener that reloads
   the page. Guarded: never armed on first install (no previous controller), at most one
   reload per page lifetime, duplicate `controllerchange` events ignored. The
   `patches:sw-updated` event is still dispatched for diagnostics/other consumers.
2. `sw.js` — navigation fallback now also covers `!response.ok`, so a broken deploy
   window serves the cached shell instead of the origin's error page.

Both are covered by `sw.behavior.test.ts` (worker evaluated against mocked
`self`/`caches`/`fetch`) and `serviceWorkerRegistration.test.ts` (fake
`navigator.serviceWorker` registration lifecycle).

## On-device verification steps (for the partner)

1. Open the app, then in DevTools → Application → Service Workers check
   **"Update on reload"** is OFF (we want the natural path).
2. Note the version banner (`patches web <version> (built <date>)` in console, or
   `window.__PATCHES_WEB__.version`).
3. Wait for (or trigger) a deploy that changes `sw.js`'s bytes or the shell — or in
   DevTools click **"Update"** on the registered worker after a deploy lands.
4. Expected within ~a minute, without interaction: the tab reloads itself once and the
   console banner shows the new build. If the network is down or the deploy is mid-roll,
   the app should still come up from the cached shell (verify via DevTools → Network →
   Offline + reload).
5. Regression check: on a fresh profile (first install), the page must **not** reload
   itself right after first registration.

If she ever sees the dead timeline again: grab `window.__PATCHES_WEB__` and
Application → Service Workers state _before_ signing out — that distinguishes
stale-bundle (old build id) from auth (signed-in UI + `Unauthenticated` in the network
tab) in one glance.
