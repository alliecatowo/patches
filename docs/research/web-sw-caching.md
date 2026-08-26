# Web service worker & caching (B-153 diagnosis, B-156 vite-plugin-pwa migration)

Investigated 2026-08-26 for B-153 ("web timeline dead until sign-out/in" after the
2026-08-25 multi-deploy session). Partner report, one-time occurrence. Rewritten
2026-08-25+ after B-156 replaced the hand-rolled worker with `vite-plugin-pwa`
(`strategies: 'injectManifest'` + Workbox); the B-153 diagnosis below is unchanged
history, the mechanics sections describe the current code. Corrected 2026-08-25+
(this change) after an audit found the persistence claim below wrong — verified
directly against the installed `workbox-precaching@7.4.1` source.

## Where the moving parts live (post-B-156)

| Piece         | Path                                                                                                                                   | Behaviour                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Worker source | `apps/web/src/pwa/sw.ts`                                                                                                               | Workbox precache + network-first navigations with `!response.ok` fallback                     |
| Worker build  | `apps/web/vite.config.ts` (`VitePWA({ strategies: 'injectManifest' })`)                                                                | compiles `sw.ts` → `dist/sw.js`, injects the build's precache manifest                        |
| Registration  | `apps/web/src/pwa/serviceWorkerRegistration.ts`                                                                                        | registers `/sw.js` on `window` load, watches `updatefound`, one-shot takeover reload          |
| Install UX    | `apps/web/src/pwa/usePwaInstall.ts`                                                                                                    | `beforeinstallprompt`/`appinstalled`/`display-mode` listeners; exposes install state honestly |
| Cache headers | `apps/web/public/_headers`                                                                                                             | `/sw.js` → `no-cache, no-store, must-revalidate`; `/index.html` → `no-cache`                  |
| Tests         | `apps/web/src/pwa/sw.behavior.test.ts`, `apps/web/src/pwa/serviceWorkerRegistration.test.ts`, `apps/web/src/pwa/usePwaInstall.test.ts` | drive the real modules (workbox included) against fakes                                       |

## Why `injectManifest` and not `generateSW`

`generateSW` configures caching via Workbox's stock strategies, and stock
`NetworkFirst` **returns a resolved non-ok response verbatim** (verified against
`workbox-strategies@7.4.1` `_getNetworkPromise`: it only falls back to the cache when
`fetch` _rejects_). The B-153 fix — fall back to the cached shell when a deploy-churn
window serves a 404/5xx page — therefore cannot be expressed with `generateSW` +
`runtimeCaching`. `injectManifest` keeps the precache manifest generation and
versioning in vite-plugin-pwa while `sw.ts` owns the ~15-line navigation handler:

```ts
try {
  const response = await fetch(options.request);
  if (response.ok) return response;
} catch {
  // offline — fall through to the precached shell
}
return cachedShell(options); // createHandlerBoundToURL('/index.html')
```

Two non-obvious Workbox facts that shape `sw.ts` (learned the hard way, both pinned
by tests):

1. **Route order matters.** Workbox routes are first-match-wins, and the precache
   route's `directoryIndex` URL variation matches `navigate` requests to `/` (→
   `/index.html`). The network-first navigation route must be registered _before_
   `addRoute()`, or navigations silently become cache-first. This is also why the
   module uses split `precache()` (manifest + lifecycle only) → navigation route →
   `addRoute()` instead of `precacheAndRoute()` (route immediately).
2. **`createHandlerBoundToURL` validates against the manifest at call time**, so it
   must run after `precache()` — another reason for the split calls above.

## Update lifecycle (current)

1. The browser revalidates `/sw.js` on navigations (served `no-store` via
   `public/_headers` — still correct: vite-plugin-pwa emits the worker at `dist/sw.js`).
2. On a byte-diff the new worker installs: Workbox populates `workbox-precache-v2-*`
   from the new build's manifest (hashed `/assets/*` are revision-less and stable;
   `index.html`/icons get fresh content revisions), then `skipWaiting()` (`sw.ts`).
3. Activation: `cleanupOutdatedCaches()` drops old-version Workbox precaches, then
   `precache()`'s own `activate` handler — `PrecacheController.activate`
   (`workbox-precaching@7.4.1`, `PrecacheController.js:191-203`, read 2026-08-25+) —
   walks every request currently in the precache and **deletes any whose URL is not a
   key in the new manifest**. That includes old hashed `/assets/*` entries the new
   build no longer references — precaching does **not** keep a grace copy for
   still-open old tabs. A `sw.ts` handler also deletes the pre-B-156
   `patches-shell-*` caches, then `clients.claim()` — the new worker takes over the
   running page immediately.
4. `serviceWorkerRegistration.ts` sees an installing worker reach `installed` while a
   controller already exists and arms a one-shot `controllerchange` listener that
   reloads the page exactly once (B-153). The old `patches:sw-updated` event was
   dropped in B-156 — it never had a listener.

**B-202 addition (2026-08-26):** step 1 above ("the browser revalidates `/sw.js` on
navigations") is the whole trigger for this update flow — and per the Service Worker
spec's [update algorithm](https://w3c.github.io/ServiceWorker/#update-algorithm), a
byte-diff check only happens on a full navigation to a page in scope, an explicit
`registration.update()` call, or the browser's own coarse (documented as up to ~24h)
background timer. A single-page app never performs another full navigation after its
first load — React Router's client-side routing never touches that path — so a tab
left open across a redeploy could sit on the pre-deploy bundle for a long time with
nothing ever checking for an update, let alone reloading. `scheduleProactiveUpdateChecks`
(added for B-202) closes that gap: it calls `registration.update()` once immediately
after registration, again whenever the tab regains visibility, and on a 15-minute
interval while visible — all three are safe no-ops when the installed worker already
matches the served `/sw.js` byte-for-byte. Pinned by
`serviceWorkerRegistration.test.ts`'s "proactive update checks (B-202)" block.

Request handling: navigations are **network-first** with the precached shell served
on network failure _and_ on `!response.ok`; `/api` + `/patches.v1.*` RPC traffic is
**never matched by any route** (the navigation matcher denies those paths and no
other route matches them), and precached URLs (hashed assets, icons, manifest) are
**cache-first** via Workbox.

**Correction (2026-08-25+, this change):** an earlier revision of this note claimed
old hashed `/assets/*` entries "persist for still-running old tabs" through an
activation. That is wrong — see step 3 above. A tab that reaches `activate` (i.e.
misses or is slower than the one-shot reload) has its old chunks evicted immediately
and falls back to fetching them straight from the origin/CDN; that only works while
the origin still serves that exact prior build's files (it currently does, since
deploys don't purge older `dist/assets/*` from the CDN, but nothing pins that
guarantee). The one-shot `controllerchange` reload (item 4) is what actually protects
an old tab in practice — it fires before the tab would ever need a since-evicted
chunk on its own.

## Hypotheses examined (B-153, unchanged)

### (a) Old SW served a stale index.html bootstrapping a bundle with an old API shape

**Ruled out as the direct cause while online.** Navigations are network-first:
whenever the timeline RPC could reach the server at all, the shell came from the
network too. The cached shell is only served when `fetch` fails or (post-fix)
resolves non-ok. RPC traffic never touches the cache, so the SW cannot stale-serve
timeline data.

**Gap found and fixed (B-153):** `fetch` _resolves_ for 4xx/5xx. During deploy churn
(rollback window, half-updated replica) the worker passed the deploy's 404/500 HTML
error page through verbatim and bricked the app even with a good shell in the cache.
Fixed: fall back to the cached shell on `!response.ok` as well.

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

### (c) Hard-coded asset hashes 404 through the cache-first strategy

**Ruled out for the reported symptom, but see the correction above.** A tab that has
already reloaded onto the new worker/bundle only ever requests the new build's hashes,
which the new precache manifest holds — cache-first hits. A tab that has _not_
reloaded and outlives activation loses its old hashed entries (per the correction
above) but keeps running old JS that requests old hashes; a 404 there requires the
origin to have stopped serving that exact prior build's files, which network-first
navigation would also fail against — sign-out/in could not have fixed it either way.
Not timeline-specific in any case, and not what B-153 hit (the reload guard in step 4
generally wins the race before this matters).

## What actually explains B-153

**A long-lived tab/PWA window running the pre-deploy JS bundle against the
post-deploy server** (2026-08-25 churned several deploys). The SW updated silently —
`skipWaiting` + `clients.claim` took over with **no reload prompt**, because the
`patches:sw-updated` event was dispatched with **no listener anywhere in the
codebase**. The running page kept executing old code whose timeline fetch failed
against the new server shape; React Query rendered "Couldn't load this timeline"
and retrying kept failing. Sign-out/in fixed it only because it forces a full page
load: network-first navigation fetched the fresh shell + bundle. One-time by nature
— once reloaded, she was on the new bundle.

## Fixes shipped

B-153 (original): one-shot `controllerchange` reload in the registration helper +
`!response.ok` fallback in the worker's navigation handler.
B-156 (this change): the hand-rolled `public/sw.js` (~150 lines) was replaced by
`vite-plugin-pwa` + Workbox (`sw.ts`, ~90 lines incl. comments); both B-153 fixes
carry over unchanged in behavior and stay pinned by the same two test files. The
registration helper no longer registers in dev builds (vite-plugin-pwa serves no
worker in dev), and the `VITE_PATCHES_DISABLE_SERVICE_WORKER` hatch became
unnecessary (dev registration is skipped outright).

Both are covered by `sw.behavior.test.ts` (the real `sw.ts` module — workbox routing
included — run against stubbed worker globals) and `serviceWorkerRegistration.test.ts`
(fake `navigator.serviceWorker` registration lifecycle).

## Install-prompt honesty (`usePwaInstall.ts`)

The install affordance only ever reflects real browser signal — it never claims
installability the platform hasn't offered:

- `isInstallable` is `deferredPrompt !== null`: true only after the browser fires
  `beforeinstallprompt` (which it preventDefaults and stashes) and false again once
  consumed (`appinstalled`, or a completed `promptInstall()`), so the UI can't show a
  stale "Install" affordance after the user already accepted or the platform already
  installed it.
- `isStandalone` starts from `display-mode: standalone` media match or iOS's
  non-standard `navigator.standalone`, and stays live via a `change` listener on that
  media query plus `appinstalled` — so a UI branch gated on "already installed" tracks
  reality even if the mode flips without a full reload.
- `isIos` is a `navigator.userAgent` sniff (`MSStream` exclusion for old IE mobile
  false positives) used only to switch to the manual "Add to Home Screen" instructions
  copy, because iOS Safari never fires `beforeinstallprompt` — there is no native
  prompt to defer there, so the hook doesn't pretend one exists.

## On-device verification steps (for the partner)

1. Open the app, then in DevTools → Application → Service Workers check
   **"Update on reload"** is OFF (we want the natural path).
2. Note the version banner (`patches web <version> (built <date>)` in console, or
   `window.__PATCHES_WEB__.version`).
3. Wait for (or trigger) a deploy that changes the shell or any asset — or in
   DevTools click **"Update"** on the registered worker after a deploy lands.
4. Expected within ~a minute, without interaction: the tab reloads itself once and the
   console banner shows the new build. If the network is down or the deploy is mid-roll,
   the app should still come up from the cached shell (verify via DevTools → Network →
   Offline + reload). After the update, Application → Cache Storage should show only
   the `workbox-precache-v2-*` cache (the old `patches-shell-v2` cache disappears on
   first activation of the new worker).
5. Regression check: on a fresh profile (first install), the page must **not** reload
   itself right after first registration.

If she ever sees the dead timeline again: grab `window.__PATCHES_WEB__` and
Application → Service Workers state _before_ signing out — that distinguishes
stale-bundle (old build id) from auth (signed-in UI + `Unauthenticated` in the network
tab) in one glance.
