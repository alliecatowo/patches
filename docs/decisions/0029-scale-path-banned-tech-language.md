# 0029. Scale path, banned-tech review, and language choice

**Status:** Accepted
**Date:** 2026-08-22

## Context

The owner wants a credible path for Patches to absorb "Facebook-scale" load, while keeping the
project open-source, self-hostable, and free of hard external dependencies (infra must be
swappable via adapters so a node can run as one box, distributed, or partly serverless). This
raised four concrete questions:

1. Are we using GraphQL, and should we be? Do we need a BFF?
2. Are the spec's v0 bans (Redis, Kafka, GraphQL) the right call, or do we need BullMQ / RabbitMQ
   / NATS / Valkey / Spark preemptively?
3. What architecture _pattern_ should the codebase follow — hexagonal / clean / DDD / something
   else — given it is currently a NestJS modular monolith with N-tier persistence and four infra
   ports?
4. Should we consider a different language (explicitly raised: **Scala**) for the scale path?

Forcing functions and constraints:

- `INITIAL_VISION.md` §153 (and Amendment B §177/§194) **hard-prohibit** Prisma, Drizzle,
  GraphQL, Firebase, Supabase-as-backend, Redis in v0, Kafka, Kubernetes, a service per module,
  offset pagination, and engagement ranking. They are authoritative and can only be relaxed by an
  explicit spec revision + sign-off, not by this ADR alone.
- The stated design target (§125) is "hundreds to low thousands of active users without
  redesign," scaling to multiple stateless API machines sharing one PostgreSQL. The owner now
  wants headroom beyond that.
- §126 forbids adding infrastructure for a _hypothetically_ slow query; any scale move must be
  preceded by fixture data, `EXPLAIN ANALYZE`, and measured latency. **That measurement work has
  NOT yet been done** — see Consequences. The escalation triggers below are therefore proposed
  _gates_, not validated thresholds.

What the codebase actually is (verified by audit): NestJS 11 modular monolith (`apps/server`) +
standalone worker (`apps/worker`), TypeORM 1.x over PostgreSQL (Neon in prod), gRPC/protobuf +
Connect edge (ADR 0016). Transport boundary is clean hexagonal (adapters + explicit mappers, no
entities on the wire). Persistence is N-tier: services inject `DataSource`/`EntityManager`
directly; there is **no repository/Unit-of-Work port**. Four genuine infra ports exist:
`FederationGateway`, `StorageClient` (R2), `EmailProvider`, `NodeFrankingKeyRing`.
`packages/domain` is a pure framework-agnostic kernel. Zero `.offset(`, zero GraphQL/tRPC
(grep-verified), 178 unary RPCs and **no streaming** (so realtime is today pure polling).

## Decision

### 1. Keep the pattern we have; refine it, don't replace it

Target = **pragmatic modular monolith + selective ports + selective DDD on the social graph**,
deferring feed read-model materialization.

- **Keep:** the transport mappers, the four domain ports, module boundaries (ADR 0001), downward
  dependency direction (§129), and the Postgres outbox (ADR 0004).
- **Do NOT introduce a full persistence `Repository`/`UnitOfWork` port now.** It would double the
  test surface for zero current gain (YAGNI) and fights NestJS's module system. Module boundaries
  already make a future swap a localized refactoring. A blanket port is only justified the day a
  _second_ datastore actually exists.
- **Next two ports after the existing four:** a `JobQueue` port (worker already exists; lets the
  SKIP-LOCKED queue later move to BullMQ/NATS with no service edits) and a `Cache`/read-through
  port (Valkey). These are genuine _second-infra_ seams — the same class as the four ports we
  already have.
- **Selective DDD-tactical:** move value objects + invariant enforcement (no self-follow,
  follow/block mutual exclusion, mute/block semantics) into `packages/domain` for the **social
  graph**; lean on the already-pure e2ee kernel. Do **not** wrap posts/reactions/reads as
  aggregates-with-repositories — that is CRUD, not domain logic.
- **Feed read model / CQRS: defer.** Serve home feeds by cursor query over followee posts
  (chronological, no ranking — which sidesteps Twitter's ranking problem). Materialize a
  `timeline_entries` table (fan-out-on-write) or a Valkey sorted set of **post-IDs only** (Mastodon
  / Twitter-capped-at-~800-IDs-per-user pattern) only when measured read latency or write
  amplification bites — realistically a celebrity/fan-out burst, not day-one load.
- **Service extraction (ADR 0001):** each module keeps one explicit exported application-service
  interface, depends only downward, never reaches across modules via `DataSource`. Promoting that
  interface to a process boundary later is a deployment change, not a rewrite. Microservices-per-
  module stays prohibited (§153).

### 2. Banned-tech review — measurement-gated, not permanent

| Technology                               | Decision for Patches                                                   | Why                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GraphQL**                              | **No.** Spec-banned; keep banned.                                      | Twitter's GraphQL is an internal ranker surface; GitHub/Shopify are enterprise-API convenience, not a backend pattern. We already have typed SDKs (proto→client codegen) — that _is_ the contract.                                                                                        |
| **BFF**                                  | **No dedicated BFF.**                                                  | Connect edge + generated SDK already serve every client uniformly. A BFF would duplicate 178 mappers + auth/rate-limit wiring — a silent-authz-bug factory (the exact thing ADR 0016 avoided).                                                                                            |
| **Redis→Valkey**                         | **Later, as a cache tier only** (requires §153 revision).              | Redis relicensed (AGPLv3 copyleft); Valkey (BSD-3, Linux Foundation fork) is AWS's default and ~20–33% cheaper managed. Would hold timeline-ID sets, rate-limit counters, sessions, presence. Not needed yet.                                                                             |
| **Kafka / Redpanda**                     | **Effectively never** for this product.                                | Overkill until partitioned event replay is required. NATS JetStream is the lighter broker if many-consumer fan-out is ever needed.                                                                                                                                                        |
| **RabbitMQ / BullMQ / pg-boss / NATS**   | **Later queue option**, not now.                                       | Postgres `SKIP LOCKED` handles ~12K jobs/s and is unbeatable for transactional outbox (enqueue in the same commit as the post). BullMQ's Postgres backend also ~11K/s. Graduate only past ~10K jobs/s or when sub-ms delayed jobs / many consumers are needed.                            |
| **Spark**                                | **No.**                                                                | Batch/ML data processing; irrelevant to a CRUD+feed social backend. Nothing in the roadmap needs it.                                                                                                                                                                                      |
| **Cassandra / ScyllaDB (wide-column)**   | **No for the core; only a future `MessageStore` port for DM history.** | Discord uses ScyllaDB _only_ for the append-only message log, not its relational core (still Postgres). Wide-column cannot express our relational feed merge / visibility+block+mute+tag filter-pushdown; it forces rigid query-first table modeling (the opposite of "flexible schema"). |
| **Document stores (MongoDB / DynamoDB)** | **No.**                                                                | "Flexible schema" is already covered by Postgres migrations + JSONB columns (already in use on `actor`, `report`, `post-edit`, `page-revision`, …). No NoSQL needed for the social graph.                                                                                                 |

### 3. Language choice — keep TypeScript/Node; Scala rejected

- **Keep TypeScript/Node as the primary stack** (spec §7). Node/NestJS is I/O-bound, not CPU-bound;
  the identified scale ceilings are PostgreSQL and the worker queue, neither of which a language
  swap fixes.
- **Scala: rejected for Patches.** Its "scale" reputation comes from big-data/Spark/fintech
  (Twitter, LinkedIn, Databricks) — and even Twitter's Scala migration is now debated as a
  "dead end" (developer churn, abstraction overhead). Adopting it here means a **total rewrite**
  of an all-TS codebase, a 3–6 month senior hiring gap, and no relief for the actual bottlenecks.
  The proto/Connect contract is language-agnostic, so a polyglot service _could_ speak gRPC — but
  no current hot path needs JVM throughput.
- **If a polyglot service is ever justified** (e.g. a high-throughput feed-materialization or
  ingestion worker), **prefer Go or Rust** over Scala: simpler operations, better gRPC/Postgres
  fit, and precedent in peers (Bluesky/ATProto relay is Go; GoToSocial is Go; Lemmy is Rust).

### 4. Escalation path — staged, each step gated on a MEASURED threshold

1. **Now (cheap, removes first breaks):** raise `WORKER_CONCURRENCY` and allow N workers claiming
   via `FOR UPDATE SKIP LOCKED` (already safe); add `DATABASE_POOL_MAX` headroom + `statement_timeout`;
   make RPC budgets / per-RPC-class rate limits **DB-backed** (extend the existing
   `rate-limit-bucket` entity) so they are global across instances, not per-process
   (`docs/operations/capacity.md` documents the per-instance gap); add a notification TTL/cleanup
   job (only refresh tokens have one today).
2. **Pre-scale (measured trigger):** introduce `JobQueue` + `Cache` ports; deploy Valkey as L2 for
   rate-limits/sessions; consider a read replica for feed reads.
3. **Tens-of-thousands of active users (measured trigger):** materialize timelines (hybrid
   push/pull, chronological); possibly BullMQ-on-Valkey or NATS for the queue.
4. **Only at VACUUM / TXID-wraparound / IOPS pressure:** Citus / partitioning / sharding.
5. **Kafka / Redpanda / Spark:** only if a future feature (multi-region replay, heavy analytics)
   genuinely demands them — not for the social core.

Every step that touches a §153 prohibition requires a spec revision + sign-off, not just this ADR.

See also [`docs/architecture/tooling-recommendations.md`](../architecture/tooling-recommendations.md)
for the consolidated living list of libraries/tooling to consider (OTel, pino, Postgres FTS,
online-DDL tooling, and the future Valkey/queue options), with rationale and the §126 measurement
gate.

## Consequences

Positive:

- The architecture is confirmed appropriate and matches every comparable OSS social backend
  (Mastodon = Rails+N-tier, Misskey = Node/NestJS with `DataSource` injected straight into
  services — literally our pattern, GoToSocial = Go modular, Lemmy = Rust with CQRS-lite read
  models). No over-engineering is introduced.
- Clear, defensible answer to "should we adopt X": adopt only behind a new port, only when
  measured. This directly honors §126.
- The four existing ports + two proposed ports give a uniform seam vocabulary for future infra
  swaps (cache, queue, datastore, service extraction).

Negative / honest costs:

- **We have not measured anything yet.** All thresholds above are proposed _gates_, not validated
  numbers. Before step 1.2+ is executed, the team must run the §126 benchmark suite: realistic
  fixture data, `EXPLAIN ANALYZE` on the home-feed query (with large follow graphs), a worker
  throughput test, and a connection-pool saturation test. Until then, claims about "where it
  breaks" are reasoning from peer write-ups, not from this schema.
- Keeping N-tier persistence means a future datastore swap is a broad (if localized) refactor
  rather than a one-line port binding — accepted as the cheaper tradeoff today.
- Scala and other languages are explicitly off the primary path; if the owner later insists on a
  JVM component, this ADR records why that is discouraged.

## Alternatives considered

- **Full hexagonal / persistence `Repository` port (rejected):** YAGNI today; doubles test surface;
  fights NestJS modules. Revisit only when a second datastore exists.
- **Clean Architecture rings (rejected):** ceremony with negligible payoff for social CRUD; rings
  conflict with Nest's module system.
- **Wholesale DDD-tactical (rejected):** the domain is mostly CRUD + a few invariants; only the
  social graph earns tactical modeling.
- **CQRS / materialized timelines now (rejected):** premature; the chronological feed makes
  fan-out-on-read defensible far longer than a ranked feed.
- **GraphQL or a BFF (rejected):** redundant with the generated typed SDK + Connect edge.
- **Kafka / Spark preemptively (rejected):** no current need; partitioned replay / batch-ML are
  not on the roadmap.
- **Scala as primary or polyglot language (rejected):** total-rewrite cost, hiring scarcity, and
  it does not address the actual (I/O/DB) bottlenecks. Go or Rust preferred if polyglot is ever
  needed.
- **Wide-column NoSQL (Cassandra/ScyllaDB) for the core (rejected):** Patches' feed/social-graph
  workload is relational (joins + visibility/block/mute/tag filter pushdown in SQL) — a poor fit
  that would force denormalized per-user timeline tables. Discord uses ScyllaDB _only_ for the
  message append-log while keeping PostgreSQL for relational data. If DM message history ever
  needs an append-optimized store at extreme scale, do it behind a `MessageStore` port (future,
  port-gated), not as a core-DB swap.
- **Document store (MongoDB/DynamoDB) for "schema can change" (rejected):** Postgres migrations +
  JSONB columns (already in use) already provide controlled, versioned schema evolution, which is
  strictly safer than schemaless. No NoSQL is needed for flexibility.
- **Redis (pre-Valkey) (rejected):** AGPLv3 copyleft licensing risk vs Valkey's permissive fork.
