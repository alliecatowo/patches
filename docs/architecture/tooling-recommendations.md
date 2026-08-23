# Tooling & library recommendations

**Status:** Living recommendation list (not committed decisions)
**Date:** 2026-08-22
**Companion ADR:** [0029 — scale path, banned-tech review, and language choice](./0029-scale-path-banned-tech-language.md)
**Source:** discovered during the architecture/scale audit (codebase review + external landscape research).

This document consolidates libraries, frameworks, and operational tooling the project should
consider. It is a **watch-list with rationale**, not an approved change. Nothing here is adopted
until it passes the spec's own gate: measure first (`INITIAL_VISION.md` §126 — fixture data,
`EXPLAIN ANALYZE`, latency benchmarks), and any item that touches a §153 hard prohibition
(GraphQL, Redis/Kafka in v0, etc.) requires an explicit spec revision + owner sign-off.

## Guiding principles for tooling choices

Consistent with the spec and `AGENTS.md`:

- **Open source, permissive license.** Prefer BSD/Apache/MIT. (Valkey over Redis for this reason;
  see ADR 0029.)
- **No hard external dependencies.** Infra must sit behind an adapter/port so a node can run as one
  box, distributed, or partly serverless. A new library that adds a runtime service (Redis, Kafka)
  is a port-gated, post-§153 decision.
- **Node/TS-native where possible; pnpm catalog for versions** (`pnpm-workspace.yaml`).
- **Avoid premature infrastructure.** The spec forbids adding tech for a _hypothetically_ slow query.
- **Keep what's already good** (see "Keep as-is" below) — this list is additive, not a rewrite.

## Current stack snapshot (relevant deps already in the catalog)

Validation: **Zod 4**. ORM/driver: **TypeORM 1.x + pg 8**. Crypto: **@noble/curves,
@noble/ciphers, @noble/hashes**, **@node-rs/argon2**, **jose**, **@simplewebauthn**. Media:
**sharp**, **@aws-sdk/client-s3 + s3-request-presigner** (R2). Transport: **@grpc/grpc-js**,
**@bufbuild/protobuf + protoc-gen-es**, **@connectrpc/connect (+express/node/web)**. Misc:
**tldts**, **tar-stream**, **@napi-rs/keyring**, **fast-check** (property tests). Dev: turbo,
mise, buf, lefthook, eslint, prettier, vitest — already solid; no change recommended.

## Observability, logging & measurement (adopt near-term)

This is the single biggest current gap and the **prerequisite for all scale work** (§126 demands
measured baselines before optimizing). None of these are hard runtime dependencies — they emit
signals; the _sink_ (collector/dashboard) is the operator's choice, which preserves the
self-hostable, no-hard-dep principle.

| Layer                   | Tool                                                                                                                 | Why                                                                                                                                         | Notes                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Structured logging**  | **pino** / `nestjs-pino`                                                                                             | Currently on Nest's default `ConsoleLogger`; pino is the high-throughput standard.                                                          | Drop-in; keeps the structured-JSON contract `overview.md` §8 requires. Never log secrets/tokens (spec rule). |
| **Tracing**             | **OpenTelemetry** SDK + auto-instrumentation (`@opentelemetry/instrumentation-pg`, `-nestjs-core`, `-grpc`, `-http`) | No `@opentelemetry`/`@sentry` in the catalog at all. This is what lets us _find_ the slow queries §126 demands.                             | Emit OTLP to a collector the operator runs (Tempo/Jaeger/OTel Collector); no SaaS lock-in.                   |
| **Metrics**             | **prom-client** (or OTel metrics) exposing a `/metrics` endpoint                                                     | Need numeric signals: RPC latency, DB pool usage, worker queue depth, feed-query latency, cache hit rate (later).                           | Scrape-friendly; operator wires Prometheus/Grafana. Lightweight, no new service.                             |
| **DB query visibility** | **`pg_stat_statements`** (extension)                                                                                 | Surfaces the actual worst queries — the empirical input to every optimization decision.                                                     | Pair with the §126 benchmark suite.                                                                          |
| **Error monitoring**    | **Sentry** (optional) or **Glitchtip** (OSS, Sentry-compatible)                                                      | `overview.md` §8 allows Sentry; for a self-hostable/OSS posture prefer Glitchtip so there's no proprietary SaaS dependency.                 | Sanitize user data before send (spec rule).                                                                  |
| **Product search**      | **Postgres native full-text** (`tsvector` / `to_tsquery`)                                                            | `SearchPosts` currently does an `ILIKE` scan (flagged worst read in `capacity.md`). FTS is built into Postgres — **zero new dependencies**. | Replace the ILIKE path; keeps search in-DB, no external engine.                                              |

### Elasticsearch / OpenSearch — not a core dependency

**Elasticsearch is not needed as a Patches dependency, and should not become one.** Two distinct
questions get conflated:

- **Product search:** do **not** reach for Elasticsearch/OpenSearch. Native Postgres full-text
  (above) covers `SearchPosts` today, and a dedicated search engine would be a hard external dep
  violating the self-hostable principle. Only revisit if filter/labeler matching or semantic
  discovery outgrows in-DB evaluation (then `pgai`/`pgvector` keeps it in Postgres — see Future).
- **Log / metric storage:** Elasticsearch (and its OSS fork **OpenSearch**) are _operator-side_
  concerns, not Patches' problem. The node should emit structured logs + OTLP/metrics and let the
  **deploying operator** decide whether to pipe them into OpenSearch, Loki, Tempo, Prometheus, or
  plain stdout + a log drain (Fly.io has one). Baking in a specific search backend would punish
  small self-hosters. So: **structured emit by default; OpenSearch only as an optional, documented
  operator sink**, never imported by the app.

This keeps Patches' "any host, no proprietary dependency" promise (v0.2 self-hostable release).

## Harden migrations (scale concern, no new runtime dep)

Large-table `ALTER`s are the classic "DB got massive and migrations suck" problem (Uber's 2016
Postgres→MySQL move was partly this; their eventual answer was schema-versioned storage — the same
escape hatch our JSONB columns already provide). Mitigations, all Postgres-native:

- Rely on **PG 11+ cheap DDL**: `ADD COLUMN ... DEFAULT` and `DROP COLUMN` are metadata-only;
  `CREATE INDEX ... CONCURRENTLY` takes no long table lock.
- Write migrations to be **online/additive**: add nullable → batch backfill (keyset, never OFFSET)
  → add constraint. Avoid type changes / NOT-NULL backfills on huge tables inline.
- Set **`statement_timeout`** (currently unset in `packages/database/src/data-source.ts`).
- Test every migration on a **Neon branch** of prod-sized data before applying
  (`docs/research/neon-branching.md`).
- **Tooling to consider:** **Atlas** (Ariga) — declarative schema + drift detection + online DDL,
  complements TypeORM's imperative migrations; **Reshape** (Pulse) — Postgres online migrations;
  **pg_repack** — rebuild/bloat control without long locks. If sharding (Citus) is ever adopted,
  distributed DDL becomes its own concern.

## Future / post-§153 revision only (spec-prohibited today)

These are sound _if and when measured thresholds are crossed_ (ADR 0029 escalation path). Each
requires a spec revision + sign-off, not just this list.

| Tool                                                               | Role                                                                                                                               | Trigger                                                                                                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Valkey** (+ **valkey-glide** client)                             | Cache tier (timeline-ID sets, rate-limit counters, sessions, presence).                                                            | Postgres read latency / write-amplification measured as the bottleneck. Valkey chosen over Redis for BSD-3 permissive license (Redis is AGPLv3 copyleft).                    |
| **BullMQ** (Postgres backend) or **NATS JetStream** or **pg-boss** | Replace/augment the SKIP-LOCKED outbox when sustained job throughput > ~10K/s or precise delayed jobs / many consumers are needed. | Worker backlog past capacity (`capacity.md` warns at 1000 PENDING).                                                                                                          |
| **pgai / pgvector**                                                | Semantic search or filter matching in SQL.                                                                                         | Only if user-side filter/labeler evaluation outgrows app-side matching, or discovery needs embedding search. Not for ranking (§153/Amendment B prohibit engagement ranking). |

## Explicitly NOT adopting (and why)

Recorded so the decision isn't re-litigated. Full reasoning in ADR 0029.

- **GraphQL** — banned (§153); typed SDK already serves every client.
- **Dedicated BFF** — redundant with the Connect edge + generated SDK; would duplicate mappers +
  auth/rate-limit wiring (silent-authz-bug risk per ADR 0016).
- **Kafka / Redpanda / Spark** — overkill; no current need (no partitioned replay, no batch-ML).
- **Scala** — total-rewrite cost, 3–6 month senior hiring gap, doesn't address the actual I/O/DB
  bottlenecks. Go/Rust preferred _if_ a polyglot service is ever justified.
- **Cassandra / ScyllaDB for the core** — our feed/social graph is relational (joins + filter
  pushdown); wide-column forces denormalized per-user timelines. Discord uses ScyllaDB _only_ for
  the message log, keeping Postgres relational. A `MessageStore` port for DM history at extreme
  scale is the only defensible use.
- **MongoDB / DynamoDB** — "flexible schema" already covered by Postgres migrations + JSONB.
- **Full persistence `Repository`/UnitOfWork port, wholesale DDD, CQRS-now** — YAGNI today; fights
  NestJS; module boundaries already make future swaps localized.

## Keep as-is (strengths worth protecting)

Zod validation; @noble pure-JS auditable crypto; jose JWT/JWE; @simplewebauthn passkeys; sharp +
aws-sdk media pipeline; Connect/protobuf dual codegen + generated `PatchesApi`/`SessionManager`/
`pagination` SDK; **fast-check** property tests; the **`di-graph.test.ts`** static DI-resolution
test; the transactional SKIP-LOCKED outbox with per-type circuit breaker; the four infra ports
(`FederationGateway`, `StorageClient`, `EmailProvider`, `NodeFrankingKeyRing`).

## Open measurement work (gates the above)

Before any infra adoption, run the §126 benchmark suite (not yet done): realistic fixture data,
`EXPLAIN ANALYZE` on the home-feed query with large follow graphs, a worker-throughput test, and a
connection-pool saturation test. Numbers in ADR 0029's escalation path are _proposed gates_, not
validated thresholds.
