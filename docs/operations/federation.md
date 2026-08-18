# Federation lab (Stage F1, v0.1)

Phase 8 (`docs/architecture/federation.md` §4 Stage F1). **Local and non-public.** Every §109
security control still applies; this is a development/testing lab, not a public federation
deployment path (see the federation architecture doc's readiness checklist, §5, before ever
setting `FEDERATION_ENABLED=true` outside a lab).

## What "federation enabled" turns on

Setting `FEDERATION_ENABLED=true` on a node does two things, both gated by the single flag:

1. `apps/server`'s `main.ts` opens a second listener, on `HTTP_PORT` (default `8080`), serving
   WebFinger, actor documents, inbox/outbox — see `docs/architecture/federation.md` §4 for the
   full list. With the flag unset (the default), that listener never opens at all — there is
   no smaller federation surface with the flag off, there is _no_ federation surface.
2. The `FederationGateway` DI token resolves to the real `ActivityPubFederationGateway`
   instead of `NoopFederationGateway` (`apps/server/src/modules/federation/federation.module.ts`),
   so following/being followed by, posting to, and liking posts by a remote actor start
   enqueuing real `FEDERATION_DELIVER` outbox jobs.

`apps/worker` needs `PUBLIC_ORIGIN` (must match the same node's `apps/server` `PUBLIC_ORIGIN`
exactly — it is embedded in every outgoing activity's `id` and in the HTTP Signature `keyId`)
and, as of B-026, the same node's `FEDERATION_KEY_ENCRYPTION_KEY` (below) — its `JobDispatcher`
already registers `FederationDeliverHandler` for the `FEDERATION_DELIVER` job type
unconditionally, and that handler decrypts `federation_keys.private_key_*` to sign every
delivery, so a mismatched or missing key on the worker fails every delivery loudly rather than
silently.

### `FEDERATION_KEY_ENCRYPTION_KEY` (B-026)

`federation_keys.private_key_*` (a local actor's own RSA-2048 signing key) is encrypted at
rest with AES-256-GCM (`packages/database/src/crypto/federation-key-cipher.ts`) rather than
stored plain. `FEDERATION_KEY_ENCRYPTION_KEY` is the base64-encoded 32-byte key:

```bash
openssl rand -base64 32
```

Set the **identical** value on both `apps/server` (required — the env schema refuses to boot
with `FEDERATION_ENABLED=true` and this unset or the wrong length) and `apps/worker` (not
schema-enforced, since the worker has no `FEDERATION_ENABLED` flag of its own — but a missing
or mismatched key means every `FEDERATION_DELIVER` job errors as soon as it tries to sign a
request). Losing this key makes every existing `federation_keys` row's private key
unrecoverable — there is no key-rotation/re-encryption tooling yet (a v0.1 gap, same posture as
every other single-operator-owned secret in this lab).

## Automated two-node test

The two-node lab is exercised end to end by an integration test — this is the only "two-node
lab" workflow actually verified in this repo; there is no separate Compose-based manual lab
yet (see "Known gaps" below).

```bash
mise exec -- pnpm --filter @patches/server build
TEST_DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_server \
  mise exec -- pnpm --filter @patches/server exec vitest run \
  --config vitest.integration.config.mts federation-two-node
```

Requires Postgres running (`mise run compose -- up -d`) with `patches_test_server` and
`patches_test_fed_b` databases created (`infra/compose/postgres/init/01-test-db.sql` creates
both when the compose Postgres container is first initialized from a clean volume; CI creates
them explicitly as a workflow step for the same reason the other per-project test databases
are). The test:

1. Runs `apps/server`'s **built** `dist/main.js` twice, as two separate OS processes ("node
   A" and "node B"), each on its own free gRPC/HTTP port pair, its own database
   (`patches_test_server` / `patches_test_fed_b`), its own generated JWT signing keypair, and
   `FEDERATION_ENABLED=true`.
2. Registers `alice@nodeA` and `bob@nodeB` over the real `AuthService.Register` RPC.
3. Discovers `bob` from node A via WebFinger + an actor-document fetch (there is no gRPC RPC
   yet for "look up a remote actor by handle" — the test drives the HTTP discovery flow
   directly; see `docs/architecture/federation.md` §4's Stage F1 gaps).
4. Calls `FollowActor` on node A, drains the resulting `FEDERATION_DELIVER` job (a small
   test-only relay, `apps/server/test/support/federation-relay.ts`, standing in for
   `apps/worker`'s `JobRunner` by claiming and delivering jobs inline instead of polling),
   confirms node B auto-accepted and delivered `Accept` back.
5. `bob` posts on node B; drains delivery; confirms the post appears in `alice`'s
   `ListHomeFeed` on node A.
6. `bob` deletes the post; drains delivery; confirms the post is tombstoned (`deleted_at` set)
   in node A's database.

Why a real child process and not two in-process `NestFactory.create(AppModule)` calls: see the
doc comment on `startFederationNode` in `apps/server/test/support/federation-node.ts` — running
two differently-configured `AppModule` instances in one process hits a real `@nestjs/config`
behavior (`ConfigModule.forRoot({validate})` evaluates exactly once per process) that silently
freezes every environment variable with a zod default to whatever it resolved to the first time
`config.module.ts` was ever imported, regardless of later `process.env` writes.

## Running one node by hand

To poke at the HTTP surface directly rather than through the automated test:

```bash
mise exec -- pnpm --filter @patches/server build
FEDERATION_ENABLED=true \
NODE_ENV=development \
NODE_DOMAIN=localhost \
PUBLIC_ORIGIN=http://127.0.0.1:8080 \
HTTP_PORT=8080 \
GRPC_HOST=127.0.0.1 \
GRPC_PORT=50051 \
DATABASE_URL=<your dev DATABASE_URL> \
node apps/server/dist/main.js
```

Then, once a local actor exists (register one first over gRPC — see `docs/operations/
local-development.md`):

```bash
curl 'http://127.0.0.1:8080/.well-known/webfinger?resource=acct:<handle>@localhost'
curl -H 'accept: application/activity+json' 'http://127.0.0.1:8080/users/<handle>'
```

## Metrics (A-036)

`FederationMetricsService` (`apps/server/src/modules/federation/federation-metrics.service.ts`)
keeps a process-local, in-memory counter registry — no Redis/Prometheus client in v0 (spec
§12). Counters: `inbox_received`, `inbox_rejected_signature`, `inbox_rejected_ratelimit`,
`inbox_ignored`, `inbox_handled` (all labeled `{domain, type}` where applicable), and
`deliveries_enqueued`. Read the current snapshot with (loopback-only — see below; run this
from the same machine as the node, e.g. over `ssh` or a Fly.io private-network proxy):

```bash
curl http://127.0.0.1:$HTTP_PORT/federation/metrics
```

Returns `{}` until at least one federation event has happened on this process, then something
like `{"inbox_received":1,"inbox_handled{domain=b.test,type=Follow}":1}` — verified locally
against a `FEDERATION_ENABLED=true` node built from `apps/server/dist/main.js`.

`GET /federation/metrics` is **loopback-only**, not token-gated — the simplest control that
still lets an operator reach it without provisioning a new secret. It also 404s if
`FEDERATION_ENABLED` is false on that process, mirroring the rest of the federation HTTP
surface. Counters reset to zero on every process restart; they are a point-in-time snapshot
for debugging/dashboards, not a durable audit log (`InboxActivity`/`outbox_jobs` are the
durable record of what actually happened).

Every 60 seconds, the same snapshot is also written as a structured log line
(`{"event":"federation_metrics", ...}`) at `LOG` level, so Fly's log aggregation captures it
even if nobody ever curls the endpoint — only while `FEDERATION_ENABLED=true` on that process.

`apps/worker` mirrors the delivery-side counters (`deliveries_succeeded`, `deliveries_failed`,
`deliveries_dead`) in its own process, in `apps/worker/src/federation/delivery-metrics.ts` —
**deliberately a separate registry** (`apps/worker` and `apps/server` are separate OS
processes with separate memory; see that file's doc comment). As of B-030, `JobRunner.run()`
also logs that registry's snapshot every 60 seconds as a structured `{"event":
"federation_metrics", ...}` line, `Logger`-tagged `[JobRunner]`, the same interval-gate pattern
as its own `sweepStaleLeasesIfDue` — unconditional (not gated on any federation-enabled flag,
since the worker has none: the snapshot is simply all-zero on a node that never runs
`FEDERATION_DELIVER` jobs). There is still no worker-side HTTP endpoint to pull a snapshot
on demand — the periodic log line is the only way to observe it, same as the per-job
structured logs (`FederationDeliverHandler`'s `SIGNER_MISSING`/`REJECTED_TERMINAL`/
`DOMAIN_BLOCKED` warnings).

## Known gaps (tracked in `docs/architecture/federation.md` §4)

- No Compose-based "two containers talking to each other" manual lab yet — `infra/compose/`
  has no federation-specific compose file. The automated two-node integration test above is
  the only exercised two-node workflow; a Compose lab is a reasonable follow-up (`mise run
fed:lab`-style) but was not built or run in this task and so is not documented as if it
  works.

## Blocking a remote domain (B-027)

```bash
patches-admin domain block <domain> [--reason <text>] --as <operator-handle>
patches-admin domain unblock <domain> --as <operator-handle>
patches-admin domain list
```

Writes/deletes a `domain_blocks` row and appends an `admin_audit_log` entry
(`docs/operations/moderation.md`), same pattern as every other mutating `patches-admin`
command. Enforced both directions: `InboxService` rejects inbound activities from a blocked
domain's sender, and `DeliveryService.enqueue` never enqueues a delivery to a blocked domain's
inbox — `apps/worker`'s `FederationDeliverHandler` re-checks at delivery time too, in case a
domain was blocked after a job was already queued.

## Security posture

`FEDERATION_ENABLED` must stay `false` on any node whose operator has not read and accepted
`docs/architecture/federation.md` §5's readiness checklist — most of that checklist (a stable
canonical domain, moderator tooling, interoperability with a mainstream Fediverse
implementation) is explicitly **not** satisfied by the Phase 8 lab, even though `Update`
semantics (A-035) and basic telemetry (A-036, see "Metrics" above) now are. Turning the flag
on for anything other than a local, non-public lab is a policy decision, not a flag flip.
