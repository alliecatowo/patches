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
inspection/replay via the admin tooling. `max_attempts` is job-type-specific; a
reasonable default is 5–10 attempts, adjustable per job type.

## 7. Idempotency

Every job handler must be safe to run more than once — a job can be claimed,
partially executed, and then retried after a crash before `completed_at` is set.
Concretely:

- `SEND_VERIFICATION_EMAIL` / `SEND_PASSWORD_RESET_EMAIL`: keyed off the underlying
  code row's `consumed_at`/expiry state so a duplicate send is at worst a duplicate
  email, never a duplicate credential state.
- `PROCESS_MEDIA`: derives deterministic output object keys from the media ID so
  re-running overwrites the same derivatives rather than creating duplicates; only
  transitions `media.state` forward.
- `CLEAN_EXPIRED_UPLOADS` / `CLEAN_EXPIRED_TOKENS`: naturally idempotent — deleting
  an already-deleted/expired row is a no-op.
- Future `FEDERATION_DELIVER`: must deduplicate deliveries at the remote-activity
  level, since federation explicitly requires duplicate-delivery safety (§108 F2,
  §160).

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
