# Deployment

**Status: mostly planned.** This document describes the target deployment architecture per
`INITIAL_VISION.md` §§84–91, §122. As of 2026-08-17 the project is in Phase 0
(repository/risk spikes) — nothing described here is live in production yet. Sections
describing not-yet-implemented automation are marked **PLANNED** explicitly; do not read
this as a description of current state.

## Target architecture

```text
                     Internet
                        |
                    Fly Proxy
                        |
                     HTTP/2
                        |
                  +-----v------+
                  | patches-api |
                  | NestJS      |
                  | gRPC        |
                  +-----+------+
                        |
             +----------+-----------+
             |                      |
             v                      v
     Fly Managed Postgres      Cloudflare R2
             |
        +----v-------+
        | worker     |
        | NestJS     |
        | standalone |
        +------------+
```

No Kubernetes. No manually-maintained EC2/VM. No serverless decomposition. The whole
runtime is one container image, run as two Fly.io process groups.

## Platform: Fly.io

Fly.io hosts the application runtime. Read the current Fly documentation before deploying —
do not copy old `fly.toml` examples blindly; Fly's gRPC/HTTP2 guidance changes. Reference:
https://fly.io/docs/. Read specifically: Launch/deployment, app configuration, Machines,
services, HTTP/2/gRPC, secrets, health checks, Managed Postgres, process groups.

Vercel, Supabase, Firebase, and raw AWS/GCP are explicitly out of scope for the primary
backend (see ADRs and `INITIAL_VISION.md` §§92–95). Vercel may host a marketing/docs site
only — it never becomes a dependency of the social backend.

## Container

**Status: planned.** A single multi-stage Dockerfile builds one image, used to run both
process types:

- deterministic build,
- non-root runtime user,
- no development dependencies in the runtime image where avoidable,
- no secrets baked into the image,
- minimal runtime image,
- graceful SIGTERM handling (see "Graceful shutdown" below).

## Process groups

One image, two Fly process groups:

```text
server   — the NestJS API (gRPC)
worker   — the NestJS standalone worker (background jobs, see docs/decisions/0004-postgres-outbox.md)
```

`release_command` runs database migrations as an explicit release step **before** new
application instances become live traffic-eligible — instances must never race each other
to apply migrations at startup. See `docs/operations/database.md` for migration policy.

If gRPC and a later HTTP federation listener end up awkward on the same public ports within
one Fly app, the plan is to deploy separate Fly apps from the same repository/image rather
than build a bespoke reverse-proxy hack. Deployment cleverness must not leak into
application architecture.

## gRPC ingress

**Status: planned.** TLS terminates at the Fly edge; the backend may speak h2c behind it.
Production client connections must use TLS end to end from the client's perspective.
Configure Fly's `h2_backend` (or current equivalent) per up-to-date Fly documentation at
implementation time — this setting has changed across Fly platform versions, so verify
current guidance rather than trusting older examples.

## Health checks

**Status: planned.** Standard gRPC health support where practical, plus an
application-level readiness check. Readiness requires at minimum: process initialized, and
PostgreSQL reachable. R2 reachability does not need to gate overall readiness unless a
specific route requires it. Fly uses service-level health checks to keep unhealthy Machines
out of routing — unhealthy instances should be pulled from traffic automatically, not
manually.

## Secrets

All production secrets (`DATABASE_URL`, `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`, R2 credentials,
`RESEND_API_KEY`, etc. — see `docs/operations/local-development.md` for the full variable
list) are set via `fly secrets set`, never committed to the repository. See
`docs/operations/database.md` and `docs/operations/local-development.md` for the
configuration surface these secrets fill.

## Domains

Recommended separation (adjust to the actual chosen domain):

```text
patches.social              marketing/docs
api.patches.social          future HTTP API
grpc.patches.social         gRPC
social.patches.social       federation origin if desired
```

Before public ActivityPub federation is enabled, the canonical actor/object origin domain
must be chosen and treated as effectively permanent — federated identities are URLs, and
domain instability breaks federation in ways that are expensive to unwind later. See
`docs/decisions/0006-activitypub-later.md`.

## CI/CD

**Status: PLANNED.** No deployment automation exists yet as of 2026-08-17 (Phase 0). The
target flow, once Phase 7 is reached:

```text
pull request
    |
    v
CI (format, lint, typecheck, buf checks, build, unit + integration tests, migration validation)
    |
merge to main
    |
    v
build image
    |
    v
run DB migration release step
    |
    v
deploy Fly server
    |
    v
deploy/update worker
    |
    v
smoke tests
```

Deploy credentials must never be exposed to pull requests from forks. Deployment to
production happens only after CI passes on `main` — never deploy directly from a branch or
a local machine as standard practice.

## Smoke tests

**Status: PLANNED.** Post-deploy smoke tests (a small script or CI job exercising
register/login/post/feed against the live deployment) are required before Phase 7 /
MVP is considered complete, per the MVP deployment checklist in `docs/product/roadmap.md`.
None exist yet.

## Graceful shutdown

On `SIGTERM`/`SIGINT`:

- **server:** stop accepting new work, drain active RPCs within a bounded timeout, close DB
  connections.
- **worker:** stop claiming new jobs, finish or safely return leased jobs, close the
  application context.

Fly can terminate Machines on its own schedule (deploys, scale-down); the application must
tolerate early termination gracefully rather than assuming a generous shutdown window.
