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

`search` is its own class because `PostService.SearchPosts` runs an `ILIKE` scan — the single
most expensive read the node serves — so it gets a far tighter budget than ordinary reads.

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

## Related

- `docs/operations/deployment.md` — how the node is deployed.
- `docs/architecture/api.md` — the RPC surface these classes cover.
