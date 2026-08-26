# Durable jobs and transactional outbox

Source of truth: `INITIAL_VISION.md` §12–13, §124. PostgreSQL is the only queue —
Redis, BullMQ, Kafka, and RabbitMQ are explicitly prohibited for v0 (§12, §153).

## 1. Why Postgres-only

At the target scale (hundreds to low thousands of active users, §125), a dedicated
broker is unjustified infrastructure. A well-defined table plus a worker that claims
rows with `FOR UPDATE SKIP LOCKED` is sufficient, durable, and simple to operate and
test.

## 2. Table: `outbox_jobs`

| Column         | Type          | Notes                                                                              |
| -------------- | ------------- | ---------------------------------------------------------------------------------- |
| `id`           | `bigint`      | PK, sequence/identity                                                              |
| `type`         | `text`        | job type (see §6 below)                                                            |
| `payload`      | `jsonb`       | job-specific data                                                                  |
| `status`       | `text`        | `PENDING` \| `PROCESSING` \| `COMPLETED` \| `FAILED` \| `DEAD`                     |
| `attempts`     | `int`         | incremented on each claim                                                          |
| `max_attempts` | `int`         | after which the job moves to `DEAD`                                                |
| `available_at` | `timestamptz` | job is only claimable once `now() >= available_at`; also used to implement backoff |
| `locked_at`    | `timestamptz` | set when a worker claims the row                                                   |
| `locked_by`    | `text`        | worker instance identifier                                                         |
| `last_error`   | `text`        | most recent failure message                                                        |
| `created_at`   | `timestamptz` |                                                                                    |
| `completed_at` | `timestamptz` | set on success                                                                     |

Index: `outbox_events(status, available_at, id)` (§60) — supports the claim query's
`WHERE status = 'PENDING' AND available_at <= now() ORDER BY id`.

## 3. Transactional outbox pattern (§13)

Any operation that must trigger durable asynchronous work writes the application
mutation and the outbox row in the **same PostgreSQL transaction**:

```text
transaction
    create user
    create verification token
    create SEND_VERIFICATION_EMAIL outbox item
commit
```

This prevents the classic failure mode where the database write succeeds, the
process crashes, and the queue publication is lost. This pattern matters
increasingly once federation delivery depends on durable remote delivery (§13).

No abstract enterprise event bus is introduced — this table and a worker loop are
sufficient (§13).

## 4. Claim query

Inside a transaction, using the transaction-specific `EntityManager` (never a global
repository inside a transaction callback, §16.3):

```sql
WITH claimed AS (
  SELECT id
  FROM outbox_jobs
  WHERE status = 'PENDING'
    AND available_at <= now()
  ORDER BY id
  FOR UPDATE SKIP LOCKED
  LIMIT :batch_size
)
UPDATE outbox_jobs
SET status = 'PROCESSING',
    locked_at = now(),
    locked_by = :worker_id,
    attempts = attempts + 1
WHERE id IN (SELECT id FROM claimed)
RETURNING *;
```

`FOR UPDATE SKIP LOCKED` makes concurrent workers safe: two workers racing this
query never claim the same row, and neither blocks waiting on the other's lock
(§12, §125).

## 5. Backoff formula

On failure, a job is rescheduled rather than retried immediately:

```text
delay = min(base_delay * 2 ^ attempts, max_delay) + jitter
```

Default (adjustable):

```text
base_delay = 5 seconds
max_delay  = 15 minutes
jitter     = random(0, base_delay)
```

`available_at = now() + delay`, `status` returns to `PENDING`, `last_error` is set.
No busy-loop polling: when a worker finds no claimable jobs, it sleeps with its own
backoff (e.g. a short fixed or slightly increasing interval) rather than hammering
the database (§12).

## 6. Dead-letter state

Once `attempts >= max_attempts`, the job transitions to `status = 'DEAD'` instead of
being rescheduled again. Dead jobs are retained (not deleted) for operator
inspection/replay via the admin tooling. Auth-email jobs are the deliberate exception:
their payload is replaced with `{ "v": 1, "redacted": true }`, the corresponding
`auth_codes` row is deleted, and replay is refused; the user requests a fresh code instead.
`max_attempts` is job-type-specific; a reasonable default is 5–10 attempts, adjustable per
job type.

## 7. Idempotency

Every job handler must be safe to run more than once — a job can be claimed,
partially executed, and then retried after a crash before `completed_at` is set.
Concretely:

- `SEND_VERIFICATION_EMAIL` / `SEND_PASSWORD_RESET_EMAIL`: keyed off the underlying
  code row's purpose, `consumed_at`, expiry, and SHA-256 hash so a duplicate send is at worst
  a duplicate email, never a duplicate credential state. The durable payload is a versioned
  AES-256-GCM envelope containing only encrypted recipient/code data and its `authCodeId`;
  success scrubs the envelope in the same update that marks the job complete.
- `PROCESS_MEDIA`: derives deterministic output object keys from the media ID so
  re-running overwrites the same derivatives rather than creating duplicates; only
  transitions `media.state` forward.
- `CLEAN_EXPIRED_UPLOADS` / `CLEAN_EXPIRED_TOKENS`: naturally idempotent — deleting
  an already-deleted/expired row is a no-op.
- Future `FEDERATION_DELIVER`: must deduplicate deliveries at the remote-activity
  level, since federation explicitly requires duplicate-delivery safety (§108 F2,
  §160).
- `EXPORT_ACCOUNT`: the `account_exports` row it fills in only ever moves `PENDING` →
  `READY`/terminal once, checked at the top of the handler — a redelivery of an
  already-non-`PENDING` row is a no-op.
- `PURGE_ACCOUNT`: re-checks the owning `account_deletion_requests` row's
  `cancelled_at`/`purged_at` at execution time (not just at enqueue time) and no-ops on
  either — the first covers a `CancelAccountDeletion` that landed after the job was
  scheduled, the second covers a redelivery after a prior run already purged. Every
  mutation inside the handler is itself conditional/idempotent, so even a crash mid-purge
  followed by a full re-run never double-applies anything.

## 8. No busy polling / graceful shutdown (§124)

The worker (`apps/worker`, a Nest standalone application context) runs a claim-loop
with sleep/backoff when idle, never a tight poll.

On `SIGTERM`/`SIGINT`:

- stop claiming new jobs,
- allow in-flight jobs to finish, or safely return their lease (reset to `PENDING`
  with `locked_at`/`locked_by` cleared) if they cannot finish within a bounded
  shutdown timeout,
- close the Nest application context cleanly.

The server process follows the analogous pattern: stop accepting new RPCs, drain
active RPCs within a bounded timeout, close DB connections (§124).

### 8.1 Stale-lease recovery (crash, not shutdown)

The graceful-shutdown lease return above only covers `SIGTERM`/`SIGINT`. A worker that
crashes outright (`kill -9`, OOM, host failure) leaves its claimed jobs `PROCESSING`
forever with no signal to react to — `locked_at` simply stops advancing. The claim loop
(`apps/worker/src/jobs/job-runner.ts`) periodically sweeps for exactly this
(`apps/worker/src/jobs/stale-lease-sweep.ts`, B-013 in tasks.md): any job still
`PROCESSING` after `WORKER_LEASE_TTL_MS` (default 10 minutes) is reset to `PENDING` for
another worker to reclaim, checked at most every `WORKER_LEASE_SWEEP_INTERVAL_MS`
(default 60s, not every claim pass — it's a table scan over `PROCESSING` rows). This is
a reclaim, not a failure: `attempts` isn't touched by the sweep itself (it's incremented
again, as normal, whenever the job is next claimed).

## 9. Job types

v0/MVP:

```text
SEND_VERIFICATION_EMAIL
SEND_PASSWORD_RESET_EMAIL
PROCESS_MEDIA
CLEAN_EXPIRED_UPLOADS
CLEAN_EXPIRED_TOKENS
```

Post-MVP (federation):

```text
FEDERATION_DELIVER
```

with related future types such as federation retry and remote actor refresh
following the same table/mechanism (§11, §108).

Amendment C, privacy and consent (§197, P14-010):

```text
EXPORT_ACCOUNT
PURGE_ACCOUNT
```

E2EE (ADR 0020, B-109):

```text
E2EE_RETENTION_SWEEP
```

`apps/worker/src/jobs/handlers/e2ee-retention-sweep.handler.ts` is a self-scheduling recurring
job: each run enqueues its own successor bucket (`E2EE_RETENTION_INTERVAL_MS`, default 24h) via
the outbox idempotency key, so no separate cron exists for it, matching `PURGE_ACCOUNT`'s pattern
above. Per run it deletes, in bounded `E2EE_RETENTION_BATCH_SIZE`-row batches with
`SKIP LOCKED`, only: mailbox envelopes that are acknowledged _and_ older than
`E2EE_MAILBOX_MAX_LATENCY_MS` (`packages/domain`, ADR 0020), one-time prekeys already recorded
consumed, and signed prekeys already recorded retired — an ambiguous (not-yet-acknowledged/
consumed/retired) row is always left alone. Deleted counts are aggregated per kind and reported
via `e2eeRetentionDeletedTotal`/`e2eeRetentionRunsTotal` (`packages/observability`); envelope/key
contents never appear in logs or metrics (§194).

`PrivacyService.ExportAccount`/`RequestAccountDeletion` (`apps/server/src/modules/privacy/`)
enqueue these; `apps/worker/src/jobs/handlers/export-account.handler.ts`/
`purge-account.handler.ts` run them. `PURGE_ACCOUNT`'s `available_at` is set to the deletion
request's `purge_after` at enqueue time — the outbox's own delay mechanism _is_ the grace-period
timer (§197.4), so no separate scheduler/cron exists for it.

## 10. Implementation status

`Status: implemented` — `apps/worker` (P1-006): `JobRunner` claim loop (`src/jobs/job-runner.ts`),
`EmailProvider` adapters for `console`/`smtp` (Mailpit)/`resend` (`src/email/`), and handlers for
`SEND_VERIFICATION_EMAIL`, `SEND_PASSWORD_RESET_EMAIL`, `CLEAN_EXPIRED_TOKENS`. Job type
constants and payload zod schemas live in `packages/database/src/jobs/`. `PROCESS_MEDIA` and
`CLEAN_EXPIRED_UPLOADS` are also implemented (media landed in Phase 5, after this section was
first written — `release-claim.ts` below is now dead code for these two types specifically,
kept for whichever job type is next to ship its handler after its producer). `EXPORT_ACCOUNT`/
`PURGE_ACCOUNT` are implemented too (P14-010) — see `docs/architecture/api.md` §3a's
`PrivacyService` subsection for what each one's scope does and does not cover yet (the export
archive is one JSON document rather than the fuller directory-tree-plus-media layout §197.3
describes; the purge's content scope is posts/media/follows/likes/DMs-sent/sessions/
credentials, not yet bookmarks/reposts/community memberships/muted tags).

`release-claim.ts`'s "release an unhandled job type back to `PENDING` without penalizing
`attempts`" mechanism is still real and still used — it just isn't needed for any job type
`JobDispatcher` currently registers a handler for; it exists for whatever future job type a
producer ships ahead of its handler.
