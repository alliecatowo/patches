# Capacity, concurrency, and abuse protection

**Status: implemented** (S-001, S-002).

How the flagship node stays up under load, what trips first, and what to tune. Every number
below is a validated config value with a default — nothing here is a magic constant in code.

There is **no Redis in v0** (spec §153). Every limit on this page is therefore either
per-process in-memory or Postgres-backed, and this page says which. On a single-instance
deployment those are the same thing; the moment you run two instances, read the
[Per-instance, not global](#per-instance-not-global) section before trusting any number.

## What trips first

Load arrives at the gRPC listener or the Connect/HTTP edge, and is shed in this order:

1. **Connection/stream limits** — refused at the transport before any handler runs.
2. **Per-RPC-class budgets** — rejected per actor or per peer, cheaply, before touching the DB.
3. **Write concurrency limit** — `NODE_OVERLOADED` rather than queuing behind a saturated pool.
4. **Handler timeouts** — a slow request is abandoned rather than held open.

Failing a _request_ is always preferred to failing the _node_.

## gRPC transport (S-001)

| Env var                       | Default            | What it does                                    |
| ----------------------------- | ------------------ | ----------------------------------------------- |
| `GRPC_MAX_CONCURRENT_STREAMS` | `100`              | Concurrent HTTP/2 streams per connection.       |
| `GRPC_MAX_CONNECTION_AGE_MS`  | `1800000` (30 min) | Forces periodic reconnect so clients rebalance. |
| `GRPC_MAX_CONNECTION_IDLE_MS` | `300000` (5 min)   | Reclaims idle connections.                      |
| `GRPC_KEEPALIVE_TIME_MS`      | `60000`            | Keepalive ping interval.                        |
| `GRPC_KEEPALIVE_TIMEOUT_MS`   | `20000`            | Keepalive ping timeout.                         |
| `GRPC_MAX_MESSAGE_BYTES`      | `4194304` (4 MiB)  | Max send/receive message size.                  |

These are real gRPC-core channel args forwarded verbatim into grpc-js, not a Patches
invention. `GRPC_MAX_MESSAGE_BYTES` is also applied to the Connect edge's internal proxy hop —
without that, a message forwarded through Connect would bypass the server's own size cap.

## HTTP / Connect edge (S-001)

| Env var                     | Default | What it does                                 |
| --------------------------- | ------- | -------------------------------------------- |
| `HTTP_MAX_CONNECTIONS`      | `512`   | Max concurrent sockets on the HTTP listener. |
| `HTTP_REQUEST_TIMEOUT_MS`   | `30000` | Whole-request timeout.                       |
| `HTTP_HEADERS_TIMEOUT_MS`   | `20000` | Header-receipt timeout.                      |
| `HTTP_KEEPALIVE_TIMEOUT_MS` | `5000`  | Idle keep-alive timeout.                     |

`HTTP_HEADERS_TIMEOUT_MS` **must stay below** `HTTP_REQUEST_TIMEOUT_MS` — Node throws at
listen time otherwise. The default gap follows Node's own stock ordering.

## Per-RPC-class budgets (S-002)

Every RPC is classified by cost, and each class has a fixed-window budget per actor and per
peer (per minute):

| Class  | Per actor | Per peer | Env vars                                                                    |
| ------ | --------- | -------- | --------------------------------------------------------------------------- |
| read   | `300`     | `600`    | `RPC_READ_BUDGET_PER_ACTOR_PER_MIN`, `RPC_READ_BUDGET_PER_PEER_PER_MIN`     |
| write  | `60`      | `120`    | `RPC_WRITE_BUDGET_PER_ACTOR_PER_MIN`, `RPC_WRITE_BUDGET_PER_PEER_PER_MIN`   |
| search | `20`      | `40`     | `RPC_SEARCH_BUDGET_PER_ACTOR_PER_MIN`, `RPC_SEARCH_BUDGET_PER_PEER_PER_MIN` |

`search` is its own class because both `PostService.SearchPosts` (`tsvector` full-text,
`AddPostsFts`) and `ActorService.searchActors` (`pg_trgm` GIN, `AddActorsTrigramSearchIndexes`)
are still the most expensive reads the node serves relative to an ordinary keyset feed page —
each scans/probes a GIN index over the whole matching set rather than a narrow btree range —
so `search` gets a far tighter budget than ordinary reads even though neither is a sequential
scan anymore.

Two more limits sit alongside them:

| Env var                       | Default | What it does                                              |
| ----------------------------- | ------- | --------------------------------------------------------- |
| `RPC_TIMEOUT_MS`              | `10000` | Per-handler timeout.                                      |
| `RPC_WRITE_CONCURRENCY_LIMIT` | `8`     | In-flight writes; excess gets `NODE_OVERLOADED`.          |
| `MENTION_FANOUT_MAX`          | `50`    | Cap on notifications fanned out from one post's mentions. |

`RPC_WRITE_CONCURRENCY_LIMIT` defaults to `8` against a `DATABASE_POOL_MAX` of `10`,
deliberately leaving headroom so reads can still get a connection while writes are saturated.
**If you raise `DATABASE_POOL_MAX`, raise this with it** — and keep the gap.

`MENTION_FANOUT_MAX` replaces what used to be a hardcoded constant in `post.service.ts`; the
default is the same value, so this is not a behavior change on its own.

## Worker outbox circuit breaker (S-002)

The worker drains a Postgres outbox. Under repeated failure it stops hammering:

| Env var                            | Default          | What it does                                                 |
| ---------------------------------- | ---------------- | ------------------------------------------------------------ |
| `WORKER_CIRCUIT_FAILURE_THRESHOLD` | `5`              | Consecutive failures of a job type before its circuit opens. |
| `WORKER_CIRCUIT_COOLDOWN_MS`       | `300000` (5 min) | How long an open circuit stays open.                         |
| `WORKER_BACKLOG_WARN_THRESHOLD`    | `1000`           | Pending-row count that starts backlog warnings.              |
| `WORKER_BACKLOG_LOG_INTERVAL_MS`   | `60000`          | How often to log while backlogged.                           |

The breaker is **per job type**: one failing job type (say, a dead R2 bucket breaking media
processing) opens only its own circuit, and the worker keeps draining everything else via the
claim query's type exclusion. The backlog threshold is observability only — it logs, it does
not shed.

## Per-instance, not global

With no Redis, the RPC budgets and the write-concurrency limit are held **in-process**. On one
instance that is a true global limit. On _N_ instances the effective ceiling is _N_ × the
configured value, because each process counts independently.

This is stated plainly rather than papered over: an honest per-instance limit you can reason
about beats a global one that does not exist. The outbox circuit breaker and backlog counts
are Postgres-backed and therefore genuinely shared across workers.

If you scale past one server instance, either divide the budgets by the instance count or
accept the higher real ceiling — but do it knowingly.

## What to tune first

1. **Legitimate users hitting limits** — raise the per-actor budget for the class involved.
   Check which class before touching anything; `search` is tight by design.
2. **`NODE_OVERLOADED` under normal load** — raise `DATABASE_POOL_MAX` first, then
   `RPC_WRITE_CONCURRENCY_LIMIT`, keeping the headroom gap.
3. **Backlog warnings without failures** — the worker is behind, not broken. Look at job
   throughput before raising thresholds.
4. **A circuit that keeps reopening** — the job type has a real dependency failure. Fix the
   dependency; raising the threshold only delays the symptom.

## DM freshness metrics (ADR 0032, P19-020)

**Status: implemented.** `docs/decisions/0032-dm-delivery-stays-poll-based.md` names two
measured re-open gates for DM streaming, T1 (latency) and T2 (load). These two `prom-client`
instruments (`packages/observability/src/metrics.ts`, registered on the same `/metrics`
endpoint as every other metric in this doc) are what make them checkable:

- **`patches_e2ee_envelope_list_age_seconds`** (Histogram, no labels) — observed once per
  mailbox envelope returned by `ListMailboxEnvelopes`
  (`apps/server/src/modules/e2ee/e2ee-conversation.service.ts`), with the value `list time minus
the envelope's received_at`. This is a **conservative proxy** for T1's "wall-clock from
  `SendEnvelopes` commit to the recipient's first `ListMailboxEnvelopes` that returns it", not an
  exact measurement of it: the server keeps no per-envelope "already listed" marker (adding one
  would be new per-envelope state), so an envelope that stays unacknowledged across several polls
  — the documented behaviour for every conversation other than the one currently open, ADR 0032
  fact 5 — is observed again, with a larger age, on every poll that still returns it. Its mass is
  therefore always at or above true first-delivery latency, never below, so a p95 read against it
  never _understates_ a T1 problem, but a rising p95 can also mean "more envelopes sitting
  unacknowledged" rather than "delivery got slower" — read it alongside the counter below.
  Buckets (`[1, 2, 5, 10, 15, 30, 45, 60, 90, 120, 300, 600]` seconds) are chosen so the
  published ~5s in-thread and ~60s focused-elsewhere SLA points, and T1's 90s trip threshold,
  each land in their own bucket.
- **`patches_read_rpc_poll_total`** (Counter, label `is_dm_poll` ∈ `{true, false}`) — incremented
  once per `read`-classified RPC (`RpcMetricsInterceptor`,
  `apps/server/src/common/interceptors/rpc-metrics.interceptor.ts`), labeled by whether the RPC
  is `ListMailboxEnvelopes` or `GetUnreadCount` (the fixed two-method allowlist ADR 0032 T2 calls
  "DM/notification poll RPCs"). DM-poll share of read volume, the number T2 names, is
  `sum(rate(patches_read_rpc_poll_total{is_dm_poll="true"}[5m])) /
sum(rate(patches_read_rpc_poll_total[5m]))`. T2 also needs `ListMailboxEnvelopes` p95 duration,
  already covered by the existing `patches_rpc_duration_seconds{method=~".*ListMailboxEnvelopes"}`
  above.

Both instruments are aggregate-only by construction (§183.4, §194): the histogram has no label
at all, and the counter's only label is a bounded two-value boolean derived from a fixed method
allowlist — never from request content, an actor id, a conversation id, or a device id.

## Related

- `docs/operations/deployment.md` — how the node is deployed.
- `docs/architecture/api.md` — the RPC surface these classes cover.
- `docs/decisions/0032-dm-delivery-stays-poll-based.md` — the DM freshness SLA and the T1/T2
  re-open gates these metrics instrument.
