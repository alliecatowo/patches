---
name: server-http-listener-gates-federation-surface
description: apps/server's Nest HTTP adapter is one shared Express instance; calling app.listen() unconditionally would expose the whole federation HTTP surface, not just the new route you meant to add
metadata:
  type: project
---

`AppModule` (`apps/server/src/app.module.ts`) imports `FederationModule` unconditionally —
its controllers (webfinger, actor, inbox, outbox) are registered on Nest's HTTP adapter
regardless of `FEDERATION_ENABLED`. Only `FederationMetricsController` re-checks the flag
itself at request time; the other federation controllers rely entirely on `main.ts` never
calling `app.listen(HTTP_PORT)` when `FEDERATION_ENABLED=false` to stay unreachable. This is
a documented invariant (`env.schema.ts`'s `FEDERATION_ENABLED` comment): a federation-off
node has "zero new network surface, not a smaller one" (spec §176).

**Why:** discovered implementing A-043 (`GET /healthz`) — the task brief said to always call
`app.listen(env.HTTP_PORT)` unconditionally, which would have silently exposed the entire
ActivityPub HTTP surface (no auth, no per-controller gate) on every self-hosted node the
moment this shipped.

**How to apply:** any future task that wants an always-on HTTP route on this app (health
checks, metrics, etc.) must NOT do it by calling `app.listen()` unconditionally. Either bind
a separate standalone `http.createServer` for just that route (see
`apps/server/src/modules/system/healthz-server.ts` for the pattern — also used by
`test/support/test-server.ts` via `startTestServer({ http: true })`), or add an explicit
`FEDERATION_ENABLED` check inside each federation controller first. Before touching
`main.ts`'s HTTP listener logic, grep `FEDERATION_ENABLED` in
`apps/server/src/modules/federation` to check whether that gap has since been closed.
