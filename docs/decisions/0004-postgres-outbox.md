# 0004. PostgreSQL-backed job queue and transactional outbox instead of Redis/Kafka

**Status:** Accepted
**Date:** 2026-08-17

## Context

Patches needs durable background work — sending verification/password-reset emails,
processing uploaded media, cleaning expired uploads and tokens, and eventually federation
delivery/retry. Some of that work must be triggered atomically alongside a database write
(e.g. "create user" and "send verification email" must not diverge if the process crashes
between them). The project's target scale is hundreds to low thousands of active users, and
the spec explicitly wants infrastructure minimalism: no component gets added on
speculation.

## Decision

Background jobs live in a **PostgreSQL-backed job table**, claimed by workers using
`SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction. Jobs carry `id`, `type`, `payload`,
`status`, `attempts`, `max_attempts`, `available_at`, `locked_at`, `locked_by`,
`last_error`, `created_at`, `completed_at`. Workers use exponential backoff, mark jobs
poison/dead after max retries, and never busy-loop (sleep/backoff when no jobs exist).
Operations that must trigger durable async work write the application mutation and the
corresponding outbox row **in the same PostgreSQL transaction** (transactional outbox
pattern) — e.g. create-user + create-verification-token + `SEND_VERIFICATION_EMAIL` outbox
row commit together. The worker itself runs as a NestJS **standalone application context**
(`apps/worker`), importing shared modules/providers rather than duplicating business logic.
No Redis, BullMQ, Kafka, RabbitMQ, or NATS in v0.

## Consequences

- No new infrastructure component to operate, secure, or pay for — Postgres is already a
  hard dependency, so this adds zero new moving parts.
- The transactional-outbox guarantee (write + job enqueue atomically) is straightforward
  with a same-database table; it would require an explicit two-phase or CDC pattern with an
  external queue.
- `FOR UPDATE SKIP LOCKED` gives safe concurrent job claiming across multiple worker
  processes without a distributed lock service.
- This does not scale indefinitely — a PostgreSQL-backed queue is not going to match a
  purpose-built queue's throughput at very high job volume. That's an acceptable and
  explicit tradeoff at current target scale, and revisiting it requires a demonstrated
  bottleneck, not a hunch.
- Federation delivery (future) depends on this same durable-job mechanism, so this decision
  is directly load-bearing for the federation roadmap, not just current email/media jobs.

## Alternatives considered

- **Redis + BullMQ.** Rejected for v0: explicitly prohibited absent a later milestone that
  concretely requires it (`INITIAL_VISION.md` §12, §153). Adds an operational dependency
  (persistence config, memory sizing, another thing to monitor) with no current justifying
  load.
- **Kafka / RabbitMQ / NATS.** Rejected: explicitly prohibited. Built for throughput and
  fan-out patterns this project does not have.
- **An abstract enterprise event bus / generic pub-sub abstraction layer.** Rejected: the
  spec is explicit that "a well-defined PostgreSQL table and worker is sufficient" — building
  a bus abstraction now would be speculative generality with no second implementation to
  justify it.
