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

The two-node lab is exercised end to end by an integration test. There is also a manual,
long-running two-node lab a human can drive by hand — "Manual two-node lab" below.

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

### Two-node lab (P18-008)

Three more round trips over the same two nodes, appended to the same test file/`describe`
block (so they share node A/B's `beforeAll` boot): repost/unrepost `Announce`/`Undo(Announce)`
id stability, tag feed inclusion, and quote-of-remote plus local-from-remote quote linkage.

**Announce-id stability proof:** the repost example captures the _actual_ pending
`FEDERATION_DELIVER` job's `payload.activity.id` for the `Announce` right after `RepostPost`,
computes the expected id independently via `localRepostAnnounceUri(nodeA.publicOrigin,
repostRow.id)`, asserts they match, then calls `nodeA.restart()` — kills node A's OS process
and respawns a brand-new one against the same database/ports/keys — before calling
`UnrepostPost`. The `Undo`'s inner `object.id`, read from the new pending job on the _new_
process, is asserted equal to the same expected id. Because the second computation happens in
a process with an empty heap, it cannot be a memoized JS value from the first call; it can only
be `buildAnnounceUndoAnnounce` re-reading the (still-persisted) `reposts` row — the B-079
regression class this test exists to catch.

**Known bug found by this round trip (reported, not fixed — outside P18-008's owned/forbidden
files):** the tag-feed example is `it.fails(...)`. `PostService.createPost`'s new-post branch
(`apps/server/src/modules/posts/post.service.ts`, inside `createPost`'s `dataSource
.transaction`) calls `this.federation.publishPost(manager, id)` _before_ `this.tagExtraction
.extractAndAttach(manager, id, ...)`. `publishPost` reads `post_tags` to build the outbound
Note's `tag` array, so at that point in the transaction it always sees zero rows — no post's
`Hashtag` ever reaches a federated peer, regardless of anything in `handleAnnounce`/
`handleCreate` (P18-004/P18-007), which are both correct and simply never receive a tag to
ingest. A fix would swap the two calls' order in `post.service.ts`. The test asserts the
_intended_ behavior and is expected to keep failing until that lands; if it ever starts
passing, `it.fails` itself fails, flagging the fix.

Run the whole file (same command as above, includes the P18-008 examples):

```bash
mise exec -- pnpm --filter @patches/server build
TEST_DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_server \
  mise exec -- pnpm --filter @patches/server exec vitest run \
  --config vitest.integration.config.mts federation-two-node
```

#### Verified run (2026-08-25)

```
 RUN  v4.1.11 /home/allie/develop/patches-agent-wt/1787721536-881301/apps/server


 Test Files  1 passed (1)
      Tests  3 passed | 1 expected fail (4)
   Start at  22:35:24
   Duration  11.27s (transform 1.70s, setup 632ms, import 2.25s, tests 8.29s, environment 0ms)
```

The 3 passing examples: the original P8-008 Follow/Create/Delete round trip, the P18-008
repost/unrepost Announce-id-stability round trip (including the node A process restart), and
the P18-008 quote round trip (quote of remote + local-from-remote, both recording a `VERIFIED`
`quote_authorizations` row with `claimedPolicy: 'ANYONE'`). The 1 expected failure is the
tag-feed example documenting the bug above.

## Manual two-node lab (B-029)

`mise run fed:lab` (`infra/lab/fed-lab.sh`) is a scripted version of the automated two-node
test above, except it starts two **long-running** processes (`apps/server` + `apps/worker`
per node) instead of a vitest run, so a human can drive them with the TUI or `grpcurl`.
`mise run fed:lab:down` stops it (kills the PIDs `fed-lab.sh` recorded in
`infra/lab/.run/*.pid`; never `pkill -f`).

It builds `@patches/server`/`@patches/worker`/`@patches/tui` once, brings up the compose
Postgres stack (`mise run compose -- up -d postgres`), creates+migrates two dedicated
databases (`patches_lab_a`, `patches_lab_b` — same "one database per node" reasoning as the
automated test's `patches_test_fed_b`, seeded by `infra/compose/postgres/init/
01-test-db.sql` on a fresh volume, created idempotently by the script itself otherwise),
generates one JWT signing keypair per node (`pnpm keys:generate`) and one shared
`FEDERATION_KEY_ENCRYPTION_KEY` (`openssl rand -base64 32`), then starts:

- Node A: `apps/server/dist/main.js`, `NODE_DOMAIN=a.localhost`, `PUBLIC_ORIGIN=http://127.0.0.1:8081`, gRPC on `127.0.0.1:50061`.
- Node B: `apps/server/dist/main.js`, `NODE_DOMAIN=b.localhost`, `PUBLIC_ORIGIN=http://127.0.0.1:8082`, gRPC on `127.0.0.1:50062`.
- `apps/worker/dist/main.js` once per node, same `DATABASE_URL`/`PUBLIC_ORIGIN`/
  `FEDERATION_KEY_ENCRYPTION_KEY` as its node's server, `EMAIL_PROVIDER=console`.

Both run with `NODE_ENV=development`, so `safeFetch`'s `defaultSafeFetchPolicy` allows plain
`http://` and private/loopback targets (`apps/server/src/modules/federation/security/
safe-fetch.ts`) — the same trust model the automated test relies on, never used in production.

**Why the WebFinger/follow acct is `handle@127.0.0.1:<http-port>`, not `handle@a.localhost`/
`handle@b.localhost`:** `NODE_DOMAIN` only feeds JWT issuer/audience and the SSH-challenge
binding (`apps/server/src/config/app-config.service.ts` call sites) — actor identity is
entirely driven by `PUBLIC_ORIGIN`. `WebfingerService.resolve` (`apps/server/src/modules/
federation/services/webfinger.service.ts`) rejects any WebFinger `resource` whose domain
isn't `new URL(this.config.publicOrigin).host`, and `RemoteActorService.resolveByAcct`
(`apps/server/src/modules/federation/services/remote-actor.service.ts`) builds the outbound
WebFinger URL as `http://<domain>/.well-known/webfinger` from the acct's domain verbatim — so
resolving/following a remote actor means typing `bob@127.0.0.1:8082`, not `bob@b.localhost`.
No `/etc/hosts` edits are needed (`getent hosts a.localhost`/`b.localhost` would resolve to
loopback on glibc/systemd-resolved anyway, but the lab never depends on it).

**Registering via the TUI CLI needs `PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1`** in most dev
sandboxes: `register`/`login` have no `--allow-insecure-credential-file` flag of their own
(only `openCredentialStore`'s callers check for it via `rest`, but `register`'s/`login`'s own
flag parser rejects the flag before that check runs) — `createDefaultCredentialStore` falls
back to a warned plaintext file only when the env var (or a keyring) is available.

### Verified run (2026-08-18)

Actually run end to end in this environment (no OS keyring, so credentials went to the
insecure-file fallback) — `mise run fed:lab` up, then `register` for both accounts via the
built TUI CLI, then a small ad hoc Node script driving the same gRPC calls the TUI's `/`
search + `f` follow + compose would (`ResolveActor`/`FollowActor`/`CreatePost`/
`ListHomeFeed` over `@patches/proto`'s generated clients — the interactive Ink keystrokes
themselves weren't scripted, but every RPC they'd trigger was driven directly and confirmed
against real node processes and real async worker delivery), then `fed:lab:down`:

```bash
mise run fed:lab
#   ... builds server/worker/tui, migrates patches_lab_a/patches_lab_b, starts node A
#   (grpc 127.0.0.1:50061, http 127.0.0.1:8081) + node B (grpc 127.0.0.1:50062, http
#   127.0.0.1:8082) + worker-a + worker-b, prints next steps
#   => four PIDs alive in infra/lab/.run/*.pid; server-a.log / server-b.log both log
#      "[Bootstrap] federation HTTP surface listening on :808{1,2}"

PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1 printf '%s' 'alice-pass-1234' | \
  PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1 node apps/tui/dist/cli.js \
  --insecure --server 127.0.0.1:50061 register --handle alice --password-stdin
#   => "Registered as @alice. Logged in on 127.0.0.1:50061."

PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1 printf '%s' 'bob-pass-1234' | \
  PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1 node apps/tui/dist/cli.js \
  --insecure --server 127.0.0.1:50062 register --handle bob --password-stdin
#   => "Registered as @bob. Logged in on 127.0.0.1:50062."

# Ad hoc driver (Login as alice/bob, ActorService.ResolveActor('bob@127.0.0.1:8082') from
# node A, SocialGraphService.FollowActor, poll GetRelationship, PostService.CreatePost on
# node B, poll FeedService.ListHomeFeed on node A), run via
# `pnpm --filter @patches/server exec node <script>.mjs` so `@patches/proto`/`@grpc/grpc-js`
# resolve from apps/server's own node_modules:
#   ==> Logging in alice@nodeA, bob@nodeB
#       alice actor id: 8cb1e2ad-638a-49bb-83d0-eefdcc10089a
#       bob actor id:   5ce3a10a-8936-4a94-ad3a-dcf23dbcf882
#   ==> ResolveActor: alice@nodeA resolves bob@127.0.0.1:8082...
#       resolved remote actor id on node A: 35f3910e-1910-4f5e-862b-b8039c31da47
#   ==> FollowActor: alice follows bob (remote)
#   ==> Waiting for async delivery (Follow -> Accept) via worker-a/worker-b...
#       following state reached: true
#   ==> bob creates a post on node B
#       created post id: dba0044e-ea1e-4884-9a3a-250d49a6d1c2
#   ==> Waiting for the post to propagate into alice's home feed on node A...
#       federated post visible on alice's home feed: true
#   ==> SUCCESS: two-node manual federation lab verified end to end.

curl -s http://127.0.0.1:8081/federation/metrics
#   => {"deliveries_enqueued{domain=127.0.0.1:8082}":1,"inbox_received":2,
#       "inbox_handled{domain=127.0.0.1:8082,type=Accept}":1,
#       "inbox_handled{domain=127.0.0.1:8082,type=Create}":1}
curl -s http://127.0.0.1:8082/federation/metrics
#   => {"inbox_received":1,"inbox_handled{domain=127.0.0.1:8081,type=Follow}":1,
#       "deliveries_enqueued{domain=127.0.0.1:8081}":2}

mise run fed:lab:down
#   => "Stopping server-a (pid ...)" / "server-b" / "worker-a" / "worker-b"; "fed:lab stopped."
```

Confirms, against real separate OS processes over real HTTP-Signature-signed loopback
requests: `ResolveActor` WebFinger discovery, `FollowActor` → async `Accept` delivery,
`CreatePost` on the remote node → async delivery → visible in the local node's
`ListHomeFeed`, matching every step the automated `federation-two-node.integration.test.ts`
exercises (minus its `Delete` → tombstone step, not driven manually here but unchanged code
path — already covered by that test).

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

- The manual two-node lab (B-029, "Manual two-node lab" above) runs both nodes as native
  processes against the existing compose Postgres service, not as two separate containers —
  `infra/compose/` still has no federation-specific compose file (a container-per-node lab
  would need distinct hostnames/networking `docker compose`-side, which `PUBLIC_ORIGIN`-driven
  identity — see above — makes unnecessary for this lab's purposes). No key rotation, no
  moderator UI, same posture as every other Stage F1 gap.

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
