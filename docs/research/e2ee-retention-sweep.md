# E2EE envelope and prekey retention sweep (B-109)

Verified 2026-08-24 against TypeORM 1.1.0, PostgreSQL 17, NestJS 11, and the Phase 13 E2EE
schema. This note records the accepted B-109 design; ADR 0031 is the decision of record.

## Primary sources

- [ADR 0020 §4–5](../decisions/0020-e2ee-direct-messages.md): acknowledgement follows a durable
  authenticated receive-state commit; `MAXLATENCY` is 30 days.
- [ADR 0031](../decisions/0031-e2ee-retention-and-prekey-reuse.md): accepted retention and
  issued-key-ledger policy.
- [`E2EE_MAILBOX_MAX_LATENCY_MS`](../../packages/domain/src/e2ee/modes.ts): protocol-owned
  30-day cleanup horizon, not node configuration.
- [TypeORM delete QueryBuilder](https://typeorm.io/docs/query-builder/delete-query-builder/) and
  [locking QueryBuilder](https://typeorm.io/docs/query-builder/select-query-builder/): the
  documented delete and PostgreSQL `pessimistic_write`/`skip_locked` APIs.

## Accepted implementation

`E2EE_RETENTION_SWEEP` uses a fixed invocation cutoff of
`now - E2EE_MAILBOX_MAX_LATENCY_MS` and deletes at most 500 rows per kind. Candidate IDs are
selected in a short transaction, timestamp then ID ascending, with `FOR UPDATE SKIP LOCKED`, then
deleted with the same transaction manager.

| Row type         | Eligibility                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Mailbox envelope | `acknowledged_at IS NOT NULL AND acknowledged_at < cutoff`                               |
| One-time prekey  | `consumed_at IS NOT NULL AND consumed_at < cutoff`, with a consumed issued-ID ledger row |
| Signed prekey    | `retired_at IS NOT NULL AND retired_at < cutoff`                                         |

The worker never deletes unacknowledged envelopes. This is intentional: `MAXLATENCY` is not
authorization to silently discard ciphertext that has no durable acknowledgement. A future
undelivered-envelope expiry policy needs a separate ADR with client-visible failure and recovery
semantics.

The server only removes retired _public_ signed-prekey rows. It cannot infer whether a pending
initial envelope was processed, nor can it cause deletion of client-vault private material.

## Issued key-ID ledger

`e2ee_one_time_prekey_key_ids` is the immutable per-device reservation ledger. Upload reserves
IDs in it before inserting public prekeys, and claim marks the ledger consumed in the same
transaction as public-row consumption. A composite foreign key prevents a public prekey without a
reservation. Retention may delete the public row but not its ledger entry, so an old consumed ID
cannot be uploaded again. Ledger rows cascade only when their device identity is purged.

The migration backfills existing IDs before adding the composite foreign key. It adds the three
partial indexes on `(acknowledged_at, id)`, `(consumed_at, id)`, and `(retired_at, id)`, each with
the matching non-null predicate. It does not seed an `E2EE_RETENTION_SWEEP` outbox job.

The job is currently dormant/unactivated. No registry-aware producer or post-deploy activation
gate exists yet, so no component can safely create the first recurring row while proving every
deployed worker understands the job type. Activation remains follow-up work after that gate exists;
the migration and current deployment must not substitute a seed or manual SQL enqueue.

## Operational and privacy properties

Each successful run schedules one daily successor by deterministic idempotency key; a collision
on that exact outbox uniqueness constraint is benign, while any other database error fails the
job. Metrics are aggregate bounded-label counters only, and completion logs expose only aggregate
counts. Handler errors are reduced to opaque stable codes/messages before they reach worker logs
or `outbox_jobs.last_error`; no payload, ciphertext, key bytes, or identifiers are recorded.

## Acceptance evidence

Real-Postgres integration tests cover cutoff boundaries, 500-row bounds, concurrent `SKIP LOCKED`
sweepers, transaction rollback, migration backfill/constraints/indexes/no seed, server
Upload→Claim→sweep→re-upload rejection, revocation/retention ledger survival, account purge
cascades, and generic job retry/dead-letter redaction. Unit tests cover the idle-poll doubling and
cap regression.
