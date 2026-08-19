---
name: nest-testserver-onmoduleinit-needs-http-true
description: apps/server's startTestServer() only runs OnModuleInit/OnApplicationBootstrap lifecycle hooks when called with { http: true } — Nest 11's startAllMicroservices() never calls app.init()
metadata:
  type: feedback
---

In Nest 11, `app.startAllMicroservices()` does not call `app.init()`; only `app.listen()` does
(guarded by `if (!this.isInitialized) await this.init()`). `app.init()` is what triggers
`OnModuleInit`/`OnApplicationBootstrap` across the whole module graph. `apps/server/test/
support/test-server.ts#startTestServer()` only calls `app.listen()` when passed
`{ http: true }` — the bare `startTestServer()` boots gRPC fine (regular DI/constructor
injection is a separate, always-eager phase) but silently skips every lifecycle hook, with zero
error or diagnostic signal. Regular constructor-injected services work identically either way;
only `OnModuleInit`/`OnApplicationBootstrap`-based logic (boot-time seeds, cache warms) is
affected.

**Why this matters:** found implementing a boot-time node-labeler seed
(`modules/labels/label-seed.service.ts`, P14-009) — the seeded row was just absent under a
plain `startTestServer()`, and `main.ts` always calls `app.listen()` in production (ADR 0016
§4), so this is a test-harness-only gap that looks exactly like an application bug.

**How to apply:** any integration test asserting on `OnModuleInit`/`OnApplicationBootstrap`
state must call `startTestServer({ http: true })`. When debugging a mysteriously-empty
boot-seeded table in a server integration test, check this before suspecting the seed logic
itself — add a `console.error` at the very top of the constructor (should fire, DI is eager)
vs. the top of `onModuleInit` (won't fire without `http: true`) to confirm. See also
[[postgres-cross-connection-self-deadlock]]-style debugging: isolate with a private
`TEST_DATABASE_URL_SERVER` database first to rule out concurrent-agent DB contention
(`QueryFailedError: relation "X" does not exist` from a racing `dropDatabase()`) as a
confusable second cause of "my seed didn't run."
