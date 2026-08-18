# 0001. Modular monolith backend architecture

**Status:** Accepted
**Date:** 2026-08-17

## Context

Patches needs a backend architecture that can move fast through v0/MVP with a small team
(effectively one implementation agent), while not painting itself into a corner if the
product grows. Microservices-per-domain are a common default for "serious" architecture
diagrams, but they add network boundaries, deployment overhead, distributed transaction
complexity, and debugging friction that this project cannot yet justify — there is no
demonstrated load or organizational ownership boundary that requires splitting services.

## Decision

Patches begins as a **modular monolith**. The backend is a single NestJS application
deployed as one primary process (plus a worker, see ADR 0004), internally organized into
clear module boundaries: `AuthModule`, `UsersModule`, `ActorsModule`, `ProfilesModule`,
`PostsModule`, `FeedsModule`, `SocialGraphModule`, `MediaModule`, `ReactionsModule`,
`NotificationsModule`, `ModerationModule`, `AdminModule`, `JobsModule`, and a
`FederationModule` that starts as interfaces/stubs only. These are logical module
boundaries, not microservices — they run in one deployment and communicate through normal
in-process calls, not network calls.

## Consequences

- Transactions across modules (e.g. create user + create verification token + write an
  outbox row) can be a single PostgreSQL transaction — no distributed transaction protocol
  needed.
- Local development and end-to-end testing stay simple: one process to run, one process to
  debug.
- Deployment stays simple: one image, two process groups (server, worker).
- Module boundaries must be maintained by discipline (import rules, dependency direction —
  see `INITIAL_VISION.md` §129) rather than enforced by network isolation, so code review
  needs to catch boundary violations.
- If a module later needs independent scaling or an independent team, it can be extracted
  once load or org structure actually demands it — the module boundaries make that
  extraction tractable rather than a rewrite.

## Alternatives considered

- **Microservices per domain module.** Rejected: no current load or team-ownership reason
  justifies the operational cost (service discovery, distributed transactions, N
  deployments, N sets of secrets, cross-service integration testing) at this stage.
  Explicitly prohibited in `INITIAL_VISION.md` §153 ("do not create a service per Nest
  module").
- **Single undifferentiated codebase with no module boundaries.** Rejected: makes future
  extraction harder and makes dependency direction violations invisible until they're deep
  and expensive to unwind.
