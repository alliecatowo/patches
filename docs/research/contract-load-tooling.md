# Contract fuzzing and load tooling — H-026/H-027/H-028

**Verified:** 2026-08-24. This is an implementation plan, not an adoption. It preserves
protobuf as the source of truth and the chronological feed rules.

## Decision summary

Do **not** add Schemathesis to Patches today. Schemathesis documents support for OpenAPI 2.0,
3.0, 3.1, 3.2 and GraphQL only; it does not consume protobuf descriptors, native gRPC, or
Connect procedure descriptors. Patches has 21 `packages/proto/proto/patches/v1/*.proto` files
and a generated descriptor collection (`PATCHES_V1_FILES`), native gRPC and a unary Connect
edge, but no OpenAPI document, Swagger decorators, or OpenAPI generator. Generating a partial
REST-shaped OpenAPI document just to satisfy a fuzzer would misdescribe the actual contract and
create a second hand-maintained API surface. H-026 should record this as **incompatible**, not
install the package. Retain/extend the existing protobuf and transport fuzz path instead.

Sources: [Schemathesis supported specifications](https://schemathesis.readthedocs.io/en/stable/)
(verified 2026-08-24); [Connect protocol](https://connectrpc.com/docs/protocol/) (unary
protobuf requests are an unframed `application/proto` message at a protobuf-derived procedure
path); repo `apps/server/src/transport/connect/` and ADR 0016.

The load suite should use a small TypeScript runner in a new `packages/load` workspace, built on
the already-installed `@patches/client`, `@connectrpc/connect-node`, generated protobuf-es, and
Node `fetch`/undici. It exercises the real Connect edge through the same typed client used by
web/mobile. This is preferable to making a generic HTTP tool reverse-engineer auth, binary
protobuf payloads, and stateful fixture ownership. It also leaves a clean boundary for native
gRPC transport parity tests using the existing `@patches/client/grpc` transport.

Do not choose `autocannon` as the primary runner: it is excellent for static HTTP request
throughput, but has no protobuf/Connect client or stateful actor lifecycle. Do not choose
Artillery: its HTTP engine still needs custom binary protocol/auth code, duplicating the typed
client. `k6` is the optional later **black-box saturation** runner: it has official gRPC support
and threshold semantics, but its gRPC client tests native gRPC, not the user-facing Connect
edge; targeting Connect requires maintaining binary request fixtures/encoding outside the
Patches client. Add it only after the TypeScript suite establishes the profiles and expected
results. Sources: [k6 gRPC](https://grafana.com/docs/k6/latest/using-k6/protocols/grpc/),
[k6 thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/),
[Artillery HTTP engine](https://www.artillery.io/docs/reference/engines/http).

## What exists and what is missing

`packages/bench` (P19-007) is a DB-only precursor, not an end-user load test:

- `fixtures.ts` destructively truncates a scratch DB and creates random 100-user/500-follow/
  1,000-post data; it is neither versioned nor server-realistic.
- `feed-bench.ts` measures only an originals-leg raw SQL query plus `EXPLAIN (ANALYZE, BUFFERS)`;
  it excludes transport, authentication, filters, repost merge, DTO work, and pagination.
- `worker-bench.ts` measures synthetic `BENCH_NOOP` `SKIP LOCKED` claims; `pool-bench.ts` measures
  artificial `pg_sleep` contention. Both remain useful component diagnostics.
- S-001 already enforces Connect socket limits (512), request/header/keepalive timeouts, gRPC
  stream/message limits, a 10-connection DB default and write concurrency 8. S-002 adds RPC
  budgets, overload shedding, and a Postgres-backed worker queue.

Observability is a starting point, not sufficient for H-027: Prometheus histograms cover gRPC
RPC and Nest HTTP requests, worker queue depth, and process defaults; OTel has pg/gRPC/HTTP/Nest
instrumentation. The server's real Connect calls are proxied to gRPC, so `patches_rpc_duration`
can cover application time; the HTTP interceptor does not necessarily surround Connect middleware.
Neither metric records DB duration/query count per RPC, connection-pool active/idle updates, nor
worker age/lag. `pg_stat_statements` is migrated opportunistically where enabled and should be
snapshotted before/after each run; never require it for a self-hosted run.

## Safe contract-fuzzing replacement (H-026)

Implement `packages/harness/src/contract-fuzz.ts` after H-014/H-015, using `fast-check` plus
protobuf-es descriptor-aware generators. Generate messages only for an explicit read-safe
allowlist (initially `GetNodeInfo`, `GetServerInfo`, public `ListLocalFeed`, `GetPost`,
`GetActor`, `ListThread`); send through both Connect and native gRPC where the target supports
them; assert no unhandled error, protocol-valid Connect/gRPC status, bounded response size/time,
and equivalent normalized status for the same request. This tests the actual protobuf schema,
procedure path, codecs and interceptors without inventing OpenAPI.

Writes/stateful chains are default-deny. A separately named `--allow-writes` run may use only a
per-run namespace such as `fuzz-<run-id>-*`, a declarative disposable world, an allowlist of
idempotency-tested operations, and cleanup proved by querying only that namespace after teardown.
It must refuse a target unless `patches-harness` identifies a local lab or H-024-approved preview
with approved parent-data policy; production, unknown hosts, and production-like data are hard
refusals. Do not fuzz auth reset, deletion, moderation, federation inbox, media finalization,
DM/E2EE, email, or external delivery. Fixture tokens, email codes, post bodies, DM material,
authorization headers and response bodies never enter artifacts; retain only seed, operation,
status, latency, redacted request shape, build SHA and fixture namespace. Delete run directories
on success; CI uploads the redacted failure bundle only.

## Repeatable traffic model (H-027)

Version fixture shapes as checked-in JSON world files, beginning with `v1-small` (100 actors,
500 follows, 10k posts), `v1-medium` (1k/10k/100k), and `v1-deep` (10k/100k/1m). Seed post
timestamps deterministically across 30 days and intentionally include: a high-follow viewer,
block/mute rows, replies/thread depth, reposts, notifications, and cursor positions near newest,
middle and deep history. Each profile records fixture version, migration/build SHA, Node/pnpm,
server/worker count, CPU/RAM limits, DB tier/pool, region, target, duration and rate/concurrency.

Run independent actor sessions—not one token—so per-actor budgets remain realistic. Profiles:

| Profile             | Mix and progression                                                                   | Purpose                                    |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| `read-feed`         | 70% home, 20% local, 10% thread; cursor walk and refresh; 1/10/100 concurrent readers | flagship chronological read budget         |
| `auth`              | register/login/refresh/logout using isolated actors; no shared credentials            | crypto/session and rate-limit cost         |
| `write-notify`      | compose public/reply/mention then poll notifications using run actors                 | write limiter, transaction and outbox cost |
| `worker-federation` | approved two-node lab delivery with a controlled local receiver                       | delivery/claim lag; never a public remote  |
| `mixed`             | 85% reads, 10% auth/notification, 5% writes                                           | realistic contention and read protection   |

Every profile has a 30-second warm-up excluded from assertions, a 3–5 minute steady interval,
and cold/warm pairs (fresh process/empty OS connection pools versus immediately repeated). Start
at 1/10/100 concurrent readers per S-001, then step rate/concurrency only while error and p99
remain inside the stated budget. A run must stop on sustained overload rather than blindly
escalating.

Capture client p50/p95/p99, RPS, success/error code counts, timeout/cancel count and response
bytes. Scrape server/worker Prometheus at run boundaries and every 5 seconds (CPU/RSS/event-loop
lag, HTTP/gRPC latency, queue depth); collect OTel traces sampled for run request IDs; snapshot
`pg_stat_statements` deltas plus `EXPLAIN (ANALYZE, BUFFERS)` for the representative feed query.
Add application metrics/spans for **DB duration and query count per RPC**, pool waiting/active/idle,
and worker enqueue-to-complete age; no SQL values, tokens, or user content as labels/span fields.

Targets are (1) local compose/lab for destructive and deterministic tests, (2) a disposable Neon
branch only with its matching local/Fly-preview app, and (3) an H-024-approved Fly PR preview for
non-destructive real-edge confirmation. Never point the DB seeder or a write profile at production.
Report local and remote separately: network distance makes their client latency incomparable.

## Budgets, regressions, and diagnosis (H-028)

Initial numbers are **measurement gates, not claims**: establish them from five clean local warm
runs per fixture/concurrency, then set per-operation p95/p99 budgets from the median run with
headroom. Keep home/local/thread separate, use the same fixed world and cursor depths, and make
the query-count/DB-time budget as important as wall latency. A PR gate runs a short `v1-small`,
10-reader warm read suite; nightly runs the full matrix. Fail only if three fresh runs show a
regression greater than both 15% and the baseline median absolute deviation noise band, with at
least 500 successful samples; automatically emit a redacted comparison artifact and allow one
explicit rerun. No gate may introduce feed `sort`/`order`, offset pagination, ranking, trending,
or engagement scoring.

Classify before fixing:

- **Resource ceiling:** CPU/RSS/event-loop or HTTP connection cap saturated while DB time/query
  count stays flat; scale server CPU/instances or tune connections after checking budgets.
- **DB/pool ceiling:** pool wait/active connections, DB time, or `pg_stat_statements` dominates;
  tune pool within Neon limits, indexes/query plan, replicas only where semantics allow.
- **Worker ceiling:** queue age/depth rises while request latency stays bounded; add worker
  replicas/concurrency after the real job profile confirms `SKIP LOCKED` throughput.
- **Architectural bottleneck:** p99/DB query count grows superlinearly with graph depth/deep cursor
  at unsaturated resources, N+1 appears, or write fan-out/transaction contention dominates.
  Capture the plan and file a measured ADR/task (possible future chronological materialization),
  never mask it by more hardware.

## Implementation slices and commands

1. H-015 first: world files and safe local/preview lifecycle. Then add `packages/load/` (its
   `package.json`, `src/runner.ts`, `src/profiles/*`, `src/metrics.ts`, `fixtures/v1-*.json`,
   tests) and root `mise` tasks such as `mise run load -- --profile read-feed --target local`.
   Add dependencies via `flock /tmp/patches-pnpm.lock pnpm add ... --filter @patches/load`; expected
   initial dependencies are workspace `@patches/client`, `@patches/proto`, `@patches/harness`,
   `@patches/testkit`, plus existing `tsx`/`vitest`—no load SaaS or generic runner dependency.
2. Add the missing redacted metrics/spans in `packages/observability/src/metrics.ts`, server DB
   instrumentation near the TypeORM boundary, and worker lag in `apps/worker`; expose only
   bounded operation labels. Update capacity operations docs with actual measurements, not estimates.
3. Add H-026's `packages/harness` protobuf fuzz command and CI local-lab bounded read job. Record
   Schemathesis incompatibility in its output/docs rather than installing it.
4. Add CI: short PR latency regression gate, failure-only redacted artifacts; scheduled full
   matrix; manual H-024 preview attach. `mise run verify` remains the final authoritative gate.
