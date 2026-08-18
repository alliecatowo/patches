# Architecture overview

Patches is a terminal-native, chronological social network. The backend is a NestJS
modular monolith speaking gRPC/Protobuf to clients; the primary client is an Ink/React
terminal UI. This document summarizes the system shape, module boundaries, layering
rules, monorepo layout, worker model, configuration, observability, security, and
performance targets. See the other files in `docs/architecture/` for the data model,
API contract, media pipeline, jobs/outbox design, federation seam, and TUI
architecture in detail.

Source of truth: `INITIAL_VISION.md` (§1, §7–13, §125–129, §161).

## 1. System diagram

The long-term multi-client shape (§1):

```text
Patches TUI
    |
    | gRPC / protobuf
    v
Patches backend
    |
    +---- PostgreSQL
    |
    +---- object storage
    |
    +---- background worker
    |
    +---- ActivityPub federation later
    |
    +---- React Native mobile app later
```

The server decides what content a user is **authorized** to access. It does not decide
what content is psychologically optimized to capture attention. Feed algorithm logic
belongs on the client over time (§2); v0/MVP ship chronological only.

## 2. Mature target architecture (§161)

```text
                            PATCHES
                               |
               +---------------+---------------+
               |                               |
               v                               v
       +---------------+              +----------------+
       |  Ink / React  |              |  React Native  |
       |     TUI       |              |     later      |
       +-------+-------+              +--------+-------+
               |                               |
               |        protobuf contracts     |
               +---------------+---------------+
                               |
                         gRPC / HTTP
                               |
                     +---------v---------+
                     |      NestJS       |
                     | modular monolith  |
                     +---------+---------+
                               |
            +------------------+--------------------+
            |                  |                    |
            v                  v                    v
      +-----------+      +-----------+       +-------------+
      | Postgres  |      |    R2     |       | Nest worker |
      | TypeORM   |      |   media   |       | outbox/jobs |
      +-----------+      +-----------+       +------+------+
                                                     |
                                                     |
                                            future federation
                                                     |
                                                     v
                                             +---------------+
                                             |  ActivityPub  |
                                             |   Fediverse   |
                                             +---------------+
```

Guiding rules:

> Start centralized, model federation correctly, earn distributed complexity later.

> Chronological first. The server gives the user their social world; the client
> decides how to arrange it.

> Ship usable vertical slices. Do not bury Patches underneath infrastructure created
> for hypothetical scale.

## 3. Modular monolith (§10)

Patches begins as **one deployable NestJS application** organized into logical
modules — not microservices. All modules run in a single primary backend
deployment (plus the separate worker process, §11).

```text
App
├── AuthModule
├── UsersModule
├── ActorsModule
├── ProfilesModule
├── PostsModule
├── FeedsModule
├── SocialGraphModule
├── MediaModule
├── ReactionsModule
├── NotificationsModule
├── ModerationModule
├── AdminModule
├── JobsModule
└── FederationModule        # interfaces/stubs only initially
```

| Module | Responsibility |
|---|---|
| `AuthModule` | Registration, login, verification, sessions, token issuance/rotation |
| `UsersModule` | Local authenticated account records (`users`) |
| `ActorsModule` | Social identity records (`actors`), local and future remote |
| `ProfilesModule` | Profile fields (display name, bio, avatar, links) on top of actors |
| `PostsModule` | Post/thread/reply creation, retrieval, deletion, editing |
| `FeedsModule` | Home/local/actor timelines, cursor pagination |
| `SocialGraphModule` | Follows, blocks, mutes |
| `MediaModule` | Upload initiation/finalization, download URLs |
| `ReactionsModule` | Likes, bookmarks |
| `NotificationsModule` | Notification rows, read state |
| `ModerationModule` | Reports, moderator actions |
| `AdminModule` | Admin CLI-facing operations, invites, audit log |
| `JobsModule` | Postgres-backed outbox/job claiming and dispatch (shared with worker) |
| `FederationModule` | `FederationGateway` interface + `NoopFederationGateway` (F0 only) |

Why a monolith first (§10): simpler transactions, fewer network boundaries, less
deployment overhead, easier local dev and end-to-end testing. Service extraction is
deferred until real load or ownership boundaries justify it — never done for
architectural appearance (§0).

## 4. Layering rules (§128–129)

Every request flows through the same four layers, and dependencies only point
downward:

```text
protobuf request
        |
        v
transport adapter / controller
        |
        v
application/domain service
        |
        v
repository / TypeORM
```

and responses flow back up through an explicit mapper:

```text
entity/query result
        |
        v
domain/application result
        |
        v
protobuf mapper
```

Rules:

- Controllers are transport adapters only. They translate protobuf requests into
  service calls and domain results into protobuf responses. No business logic in
  controllers.
- TypeORM entities are **never** returned directly over the API (§128, §153). A
  protobuf mapper always sits between domain results and wire messages.
- Domain/application modules do not know about Ink, gRPC transport details, or
  storage internals.
- The TUI never imports TypeORM entities.
- The `packages/proto` package never imports server implementation modules.
- Database packages never import gRPC/transport packages.

Dependency direction is deliberately boring: `proto → controller → service →
repository`, never the reverse, and never a lateral shortcut (e.g., controller
calling a repository directly).

## 5. Monorepo layout (§8)

pnpm workspaces + Turborepo (task orchestration/caching). Not Nx, unless a concrete
blocker emerges.

```text
patches/
├── apps/         server, worker, tui, admin
├── packages/     proto, config, domain, database, observability, media, testkit
├── infra/        docker, fly, compose
├── docs/         architecture, decisions, operations, product
├── .github/workflows/
├── mise.toml, pnpm-workspace.yaml, turbo.json, package.json,
│   tsconfig.base.json, eslint.config.*, prettier.config.*,
│   docker-compose.yml, README.md
```

| Path | Purpose |
|---|---|
| `apps/server` | NestJS gRPC backend — the modular monolith |
| `apps/worker` | Nest standalone application context; outbox/job consumer |
| `apps/tui` | Ink/React terminal client |
| `apps/admin` | `patches-admin` CLI (Nest standalone or `nest-commander`) |
| `packages/proto` | Canonical `.proto` schemas + generated ts-proto output |
| `packages/config` | Shared `@nestjs/config` schemas/validation |
| `packages/domain` | Framework-agnostic domain types/rules shared across apps |
| `packages/database` | TypeORM entities, migrations, data-source config |
| `packages/observability` | Logging/OpenTelemetry/Sentry wiring for server + worker |
| `packages/media` | sharp processing helpers, S3/R2 client wrapper |
| `packages/testkit` | Test factories, fixtures, integration test harness |
| `infra/docker`, `infra/fly`, `infra/compose` | Dockerfiles, `fly.toml`(s)/process groups, local Compose services |
| `docs/architecture`, `docs/decisions`, `docs/operations`, `docs/product` | This directory, ADRs, runbooks, principles/roadmap |

Packages must represent legitimate shared boundaries — no package created merely to
hold one helper function (§8).

## 6. Worker model (§11)

`apps/worker` is a Nest **standalone application context** (no network listener),
importing shared providers/modules from the backend rather than duplicating business
logic. This is the officially supported Nest pattern for background processes.

Worker responsibilities, v0/MVP:

- send verification emails
- send password-reset emails
- process uploaded media (sharp pipeline, see `media.md`)
- clean expired uploads
- clean expired auth tokens
- execute durable outbox jobs (see `jobs.md`)

Later (post-MVP):

- federation delivery
- federation retry
- remote actor refresh
- remote media proxy/cache
- notification fan-out if required

The worker claims jobs from a PostgreSQL-backed table using
`SELECT ... FOR UPDATE SKIP LOCKED` — no Redis, no message broker (§12). See
`docs/architecture/jobs.md` for the full job/outbox design.

Graceful shutdown (§124): on SIGTERM/SIGINT the worker stops claiming new jobs,
finishes or safely returns leased jobs, then closes its application context. The
server stops accepting new work, drains active RPCs within a bounded timeout, then
closes DB connections.

## 7. Configuration (§97)

Configuration uses `@nestjs/config` with startup-time environment validation. The
application **must refuse to boot** when required production configuration is
malformed — no silent defaults for required secrets.

Representative environment variables:

```text
NODE_ENV

DATABASE_URL

GRPC_HOST
GRPC_PORT

PUBLIC_ORIGIN

JWT_PRIVATE_KEY
JWT_PUBLIC_KEY

R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_ENDPOINT

RESEND_API_KEY
EMAIL_FROM

INVITE_ONLY
```

Secrets are never committed to the repository.

## 8. Logging and observability (§98–100)

**Structured logging.** Nest's JSON `ConsoleLogger` is the default. Every log line
carries: timestamp, level, service, request ID, RPC method, actor/user IDs where
appropriate, latency, and outcome. Never logged: passwords, access tokens, refresh
tokens, verification/reset codes, raw `authorization` headers.

**Tracing/metrics.** OpenTelemetry is adopted as the project matures. By MVP, track
at minimum: request/RPC latency, error rate, DB query latency where practical,
worker queue depth, failed job count, media processing latency. Export to a simple
compatible provider at deploy time; no elaborate observability stack locally.

**Error monitoring.** Sentry may be used in production for exception monitoring
(direct NestJS integration available), is not required locally, and user data sent
to it must be sanitized.

## 9. Security summary (§101–104)

Security is part of MVP, not a later polish pass. Required baseline:

- Argon2id password hashing (see `data-model.md` §users)
- refresh token rotation + reuse detection (see `data-model.md` §refresh_tokens)
- rate limiting on sensitive flows (login, registration, password reset,
  verification resend) — `@nestjs/throttler`, DB-backed for flows needing
  cross-instance consistency, process-local for coarse general throttles (no Redis
  in v0)
- validation of all external input at the service layer — protobuf typing is not
  runtime validation
- object-level authorization checks (a user only downloads/mutates what they're
  entitled to)
- file validation in the media pipeline: never trust filename extension,
  client-supplied MIME type, or client-supplied dimensions
- safe process spawning in the TUI: argument arrays, never shell string
  interpolation of untrusted paths
- parameterized DB access only, via TypeORM
- sanitized error responses — no stack traces returned to clients
- admin audit logging (`admin_audit_log`, see `data-model.md`)
- SSRF protections required before any federation networking is enabled (§109)

URL validation (§104): profile/post URLs allow `https`/`http` only by default;
schemes like `javascript:`, `data:`, `file:` are rejected. Patches does not
automatically fetch arbitrary user URLs in v0, which also avoids early SSRF surface.

## 10. Performance expectations (§125–126)

Design target: **hundreds to low thousands of active users** without redesign. The
architecture should scale horizontally to multiple stateless API Machines sharing one
PostgreSQL instance — not to internet-scale from day one.

Concrete expectations:

- feed queries must not produce N+1 query patterns
- media bytes never transit the API data plane (presigned direct upload/download,
  see `media.md`)
- all timeline/list endpoints use cursor pagination, never offset pagination
- required indexes exist before shipping a query path (see `data-model.md` §indexes)
- response payloads are bounded; thread loading is bounded and paginated, never
  unbounded
- worker jobs claim concurrently and safely (`FOR UPDATE SKIP LOCKED`)

Before optimizing: generate realistic fixture data, benchmark the feed query, inspect
`EXPLAIN ANALYZE`, measure gRPC latency, measure media processing memory. Redis is not
added speculatively for a hypothetically slow future query (§126, §153).

## 11. Related documents

- `docs/architecture/data-model.md` — entities, ER diagram, indexes, constraints
- `docs/architecture/api.md` — protobuf/gRPC contract, error model, limits
- `docs/architecture/media.md` — upload/processing pipeline
- `docs/architecture/jobs.md` — outbox/job table, claim query, backoff
- `docs/architecture/federation.md` — federation seam and staged rollout
- `docs/architecture/tui.md` — Ink/React terminal client architecture
