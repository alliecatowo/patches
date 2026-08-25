# Postmortem — 2026-08-24 web outage (405/415 on all API calls)

**Impact:** every browser client of `patches-web.pages.dev` could not load the timeline
or sign in for roughly 30 hours. TUI users were unaffected until the final deploy, after
which native gRPC moved to `:50051`.

**Owner-reported:** "can't load timeline", then sign-in returning 405s.

## Timeline (UTC)

| When              | What                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aug 23 ~02:31     | Release v43 deployed from a worktree whose `fly.toml` predated the dual-service ingress config — prod kept serving an image built before Phase 19 and the E2EE hardening wave                                      |
| Aug 24 ~18:20     | First successful CI-config deploy (`flyctl deploy` with current main). The config carried **two public service blocks**: HTTPS :443 bound to the **native gRPC listener** (:50051) and :80 to Connect HTTP (:8080) |
| immediately after | All browser POSTs to `/patches.v1.*` hit grpc-js → **415 Unsupported Media Type**; devtools showed ~405-class failures. Owner reported "can't load timeline / 405s"                                                |
| Aug 24 ~19:05     | Root cause found by curling each listener directly; ingress rebound: :443/:80 → Connect (8080), native gRPC → dedicated public :50051                                                                              |
| Aug 24 ~19:10     | Second regression found: a manual Pages redeploy had been built without `VITE_PATCHES_API_BASE`, so the bundle posted to same-origin `/api` → static host 405s                                                     |
| Aug 24 ~19:20     | Build-time guard added (production vite build fails without the var); Pages rebuilt with correct origin; `WEB_API_BASE` repo variable set                                                                          |

Separately, the owner's own session was stuck in an hours-long refresh-reuse loop
(`AUTH_SESSION_EXPIRED`, one constant `reuseSessionId`) — fixed in #74 (SDK now clears
dead pairs instead of looping, plus cross-tab refresh adoption), requiring one fresh login.

## Root causes

1. **Ingress config landed untested.** The dual-service `fly.toml` (P10-004-era + later
   edits) was never exercised against a real deploy until today; Fly accepted the config
   but routed :443 to gRPC.
2. **Local deploys bypassed CI env injection.** `wrangler pages deploy dist` from a shell
   builds without `VITE_PATCHES_API_BASE`; the `/api` fallback is fine in dev (vite proxy)
   and fatal in production.
3. **No canary/smoke between deploy and owner traffic.** The deploy workflow's smoke step
   only runs in the gated CI path, which was disabled at the time.

## Corrective actions (landed in this repo)

- `apps/web/vite.config.ts`: production build **throws** when `VITE_PATCHES_API_BASE` is
  absent (dev keeps the `/api` proxy fallback).
- `mise run web:deploy`: enforced-env local deploy task (build + wrangler, production alias).
- `apps/web/public/_headers`: `sw.js` and `index.html` are no-cache; SW bumped to v2 with
  `skipWaiting`/`clients.claim` so installed PWAs stop running ancient bundles (#74).
- Session SDK: dead refresh pairs are cleared instead of looping; cross-tab refresh adopts
  the stored successor (#74).
- Ingress: :443/:80 → Connect; native gRPC → public :50051 (TUI configs must append port).

## Follow-ups

- Human: create a dashboard-scoped Fly deploy token for `FLY_API_TOKEN` (CI main-app
  remote builds still get `unauthorized` with ad-hoc tokens; previews work).
- Re-enable-and-watch the CI smoke step on the next gated deploy.
- B-092 MinIO 403 diagnosis so local integration runs fully green again.
