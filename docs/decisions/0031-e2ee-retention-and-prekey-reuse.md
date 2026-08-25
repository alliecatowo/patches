# 0031. Safe E2EE retention cleanup and one-time-prekey reuse prevention

**Status:** Accepted
**Date:** 2026-08-24
**Clarifies:** [0020](./0020-e2ee-direct-messages.md) §5 and §7
**Relates to:** B-109, [0030](./0030-pre-alpha-consolidation-policy.md)

## Context

B-109 calls for a worker to delete acknowledged mailbox envelopes past `MAXLATENCY`, consumed
one-time prekeys, and superseded signed prekeys. The current E2EE tables make two destructive
interpretations possible, neither of which is safe to leave implicit.

First, B-109 literally names _acknowledged_ envelopes, while ADR 0020 §5 calls `MAXLATENCY` how
long a device mailbox holds an undelivered envelope. An acknowledgement is only legal after the
recipient has authenticated the envelope and durably committed the receive-ratchet state (ADR
0020 §4). Deleting an unacknowledged row would therefore discard opaque ciphertext without proof
that any client possesses its plaintext or can recover its ratchet state.

Second, the unique `(device_identity_id, key_id)` index on `e2ee_one_time_prekeys` prevents reuse
only while the consumed row remains. Physical deletion would let that device upload the same ID
again, violating the `ClaimPrekeyBundles` contract that the node never returns the same one-time
prekey twice. A per-device high-water mark would be compact, but it would silently change the
current arbitrary-positive-ID protocol into a monotonic-ID protocol.

The node has only public signed-prekey rows. It does not persist which signed-prekey ID an initial
envelope used, and neither `E2eeMailboxEnvelope` nor `E2eeLogicalMessage` can prove that a pending
initial envelope was processed. Server cleanup cannot therefore safely drive client-vault private
key deletion.

This ADR does not deviate from `INITIAL_VISION.md` or its hard rules. It resolves an ambiguity in
ADR 0020 conservatively: a retention-worker cleanup horizon is not authorization for silent
discard of unacknowledged E2EE ciphertext.

## Decision

### 1. B-109 deletes acknowledged envelopes only

For this worker, `E2EE_MAILBOX_MAX_LATENCY_MS` is a protocol-owned cleanup horizon, never an
operator setting. A run takes one fixed `cutoff = now - E2EE_MAILBOX_MAX_LATENCY_MS`; mailbox
eligibility is exactly:

```text
acknowledged_at IS NOT NULL AND acknowledged_at < cutoff
```

`received_at`, `deleted_at`, and an expired device certificate are not substitutes for a durable
acknowledgement. The worker MUST NOT select or delete `acknowledged_at IS NULL` rows, including
rows older than `MAXLATENCY`. It must not change delivery, acknowledgement, replay, or client
ratchet behavior to make those rows eligible.

This clarifies the ambiguous ADR 0020 §5 wording: `MAXLATENCY` describes the bounded old-session
window a client plans around, not an implementation license for the node to erase an undelivered
envelope. A device offline longer than the window still needs fresh sessions as ADR 0020 says, but
the node retaining an old unacknowledged ciphertext is safer than silently destroying it. An
explicit future undelivered-envelope expiry policy requires a separate ADR and owner approval. It
must first define client-visible expiry/failure state, recovery behavior, authenticated protocol
binding, privacy copy, and how old signed-prekey private keys are correlated with initial
envelopes.

### 2. Use an immutable issued-key ledger before consuming rows are swept

Add `e2ee_one_time_prekey_key_ids` as the canonical, durable per-device key-ID ledger:

```text
device_identity_id  uuid not null references e2ee_device_identities on delete cascade
key_id              bigint not null check (key_id > 0)
issued_at           timestamptz not null
consumed_at         timestamptz null
primary key (device_identity_id, key_id)
```

Every one-time-prekey upload MUST, in the same transaction, reserve all supplied IDs in this table
before it inserts public prekey rows. A duplicate ledger primary key is a validation failure; it
is not an idempotent success and must not replace public-key bytes. The prekey table MUST carry a
composite foreign key `(device_identity_id, key_id)` to the ledger. This makes an old or partially
rolled-back server fail a new upload rather than create an unprotected prekey row.

Claiming a prekey marks both the public prekey row and its ledger row consumed in the same
transaction. The retention worker may physically delete a consumed public row only because its
ledger reservation remains. Ledger rows are immutable in identity and key ID; they remain for the
lifetime of the device-identity row, including after revocation and after the public prekey row is
removed. They are removed only by the device identity's existing account-purge cascade.

One-time-prekey IDs are opaque identifiers, not a sequence: B-109 preserves arbitrary ordering,
gaps, and batched out-of-order upload. Each must be a positive value representable by the existing
PostgreSQL `bigint` column; values outside that existing range are rejected before reservation.
There is no high-water mark and no reuse below a watermark. Signed-prekey IDs are separate: their
existing strictly-increasing active-key rule remains unchanged, and sweeping retired public rows
does not loosen it.

A replaced, reset, or recovered device MUST receive a fresh random `device_id`, certificate, and
database device-identity row, and thus a fresh key-ID namespace. It must not reuse an inactive
device ID: the append-only roster already forbids re-pointing a device ID to a new certificate or
reactivating it. Root rotation is not a reset of a surviving device's one-time-prekey namespace.

### 3. Signed-prekey cleanup is server-public-material cleanup only

The signed-prekey worker predicate is exactly:

```text
retired_at IS NOT NULL AND retired_at < cutoff
```

It deletes only the retired server public row. Active signed prekeys are never eligible, and
`ClaimPrekeyBundles` continues to serve only non-retired rows. This deletion neither proves that
pending initial envelopes were received nor tells a client to remove its old signed-prekey private
key. B-109 MUST NOT claim that it implements ADR 0020 §5's client-private-key phrase “after
pending initial envelopes are processed”; current server schema cannot establish that condition.
Client-vault retention and deletion stay out of this worker. Any later attempt to couple them must
be a protocol change covered by the explicit-expiry decision in section 1.

### 4. Bounded, locked, content-free execution

`E2EE_RETENTION_SWEEP` runs daily through the PostgreSQL outbox and schedules one daily successor
with a deterministic idempotency key derived from the parent job identity and the next persisted
scheduled bucket. Its payload contains only that ISO-UTC scheduled bucket; retries and redelivery
therefore never derive a successor from wall-clock day. The initial activation is performed only
after the registry-aware server and registered worker handler are deployed. It is an operator or
registry-aware post-deploy gate, never a schema-migration seed, so an older worker cannot consume
an unknown job.

The batch size is a compile-time constant of 500 candidate IDs per row kind per invocation, not an
operator knob. For each kind, use a short, separate `dataSource.transaction` and that callback's
`EntityManager` exclusively:

1. Select IDs only, ordered by `(retention_timestamp ASC, id ASC)`, with `pessimistic_write` and
   `skip_locked`.
2. Delete exactly those IDs in the same transaction.
3. For one-time prekeys, rely on the pre-existing immutable ledger; do not delete a public row if
   its reservation is absent or inconsistent.

The other exact predicates are `consumed_at IS NOT NULL AND consumed_at < cutoff` and the
signed-prekey predicate in section 3. Strict `<` keeps equality at the boundary. Separate
transactions and `SKIP LOCKED` make overlapping jobs, redelivery, and a crash after a committed
delete naturally idempotent without holding locks across unrelated tables.

Metrics may expose only aggregate counts: a deletion counter with bounded `kind` values
`mailbox_envelope`, `one_time_prekey`, and `signed_prekey`, and a run counter with bounded
`outcome` values `succeeded` and `failed`. Completion logs may contain only those aggregate
counts. No log, metric, trace, error, outbox payload, or dead-letter record may include ciphertext,
encrypted headers/openings, public-key or signature bytes, logical-message, envelope, actor, or
device identifiers.

### 5. Migration, rollout, and rollback

The schema migration first creates and backfills the ledger from every existing one-time-prekey
row, preserving `uploaded_at`/`consumed_at`, then adds the composite foreign key and the three
retention indexes:

```text
e2ee_mailbox_envelopes (acknowledged_at, id) WHERE acknowledged_at IS NOT NULL
e2ee_one_time_prekeys (consumed_at, id) WHERE consumed_at IS NOT NULL
e2ee_signed_prekeys (retired_at, id) WHERE retired_at IS NOT NULL
```

The registry-aware upload and claim code is deployed behind a write fence: no old server may accept
prekey uploads after the foreign key is active. This is intentionally fail-closed during a rolling
deployment; an old binary that lacks the ledger reservation must reject/fail the upload rather than
silently defeat the anti-reuse invariant. Enable or seed the retention job only after that fence is
complete and registry write/claim tests are green.

There is no destructive rollback after a sweep has run: deleted ciphertext/public keys are not
reconstructed from logs, metrics, or a new migration. A code rollback must keep the ledger and its
foreign key, stop the sweep before accepting uploads, and roll forward to a registry-aware binary.
The migration's `down` is deliberately fail-closed and refuses to remove the ledger or foreign
key. Schema rollback that removes either is prohibited once it has protected data.
This is compatible with ADR 0030's pre-alpha consolidation policy: the sequencing is a safety
fence, not a legacy compatibility window.

### 6. Implementable acceptance criteria

An implementation of B-109 is complete only when all of the following hold:

1. An unacknowledged envelope, including one far older than `MAXLATENCY`, survives a sweep; an
   acknowledged envelope at the cutoff survives; one strictly before it is deleted.
2. Active/available prekeys survive; exactly 500 of 501 eligible rows are deleted in stable
   timestamp/ID order for each kind; concurrent PostgreSQL transactions using `SKIP LOCKED` neither
   delete nor count the same row twice.
3. The migration backfills every existing one-time-prekey ID before the foreign key is enforced.
   New uploads reserve the ledger atomically, a duplicate ID is rejected before/with no public
   prekey insertion, and a consumed-and-swept ID remains rejected forever for that device identity.
4. A claim atomically consumes the ledger and public row. Revoke leaves the issued-ID ledger in
   place. A fresh replacement device can use a fresh namespace, while reusing an inactive device ID
   is rejected by the roster/enrollment path.
5. Retired signed public prekeys strictly older than the cutoff delete; active rows do not. Tests
   and documentation explicitly state that this does not prove pending-initial-envelope processing
   or delete client private material.
6. A zero-match run succeeds and schedules one successor. A retry after a committed delete but
   before job completion is safe and results in one scheduled successor. Unknown-job and
   pre-registry activation order are covered by deployment/migration tests or a documented release
   gate.
7. Migration tests assert all three partial indexes, the ledger primary key/foreign keys, and
   complete backfill. Handler tests prove only aggregate bounded-label metrics and logs are emitted;
   E2EE payloads and identifiers are absent.

## Consequences

The node reclaims acknowledged ciphertext and obsolete public material without creating a silent
undelivered-message deletion path. The issued-key ledger shrinks long-lived one-time-prekey storage
from full public-key rows to compact IDs while retaining the cryptographic non-reuse invariant and
the current non-monotonic ID wire behavior.

The cost is an intentionally permanent per-device ID ledger and a fail-closed migration fence. An
offline client can still encounter an old initial envelope it cannot open after its own bounded
private-key retention window; B-109 does not hide or solve that protocol limitation. It preserves
the ciphertext rather than adding a new silent-loss failure, and records the work required before a
future expiry policy can claim to solve it.

## Alternatives considered

- **Delete all envelopes older than `MAXLATENCY`.** Rejected: `received_at` does not demonstrate a
  durable receive-state commit; this would silently lose unacknowledged ciphertext and conflicts
  with B-109's literal acknowledged-envelope scope.
- **Delete unacknowledged envelopes only after a longer grace period.** Rejected: changing the
  duration does not create acknowledgement or recovery proof. It needs the separate expiry
  protocol/owner decision described above.
- **Keep consumed one-time-prekey rows forever.** Rejected: correct today but retains public-key
  material and makes the requested cleanup impossible; the immutable ID ledger preserves the
  security property at lower storage cost.
- **Per-device high-water mark.** Rejected: it changes opaque arbitrary key IDs into an ordering
  protocol, complicates out-of-order uploads, and fails to represent valid gaps without a new
  client contract.
- **Consumed-ID-only tombstones written at sweep time.** Rejected: a concurrent or old upload can
  race between deletion and tombstone creation unless every issued ID is guarded on the write path.
  The issued-key ledger and foreign key make that invariant structural.
- **Use signed-prekey public-row deletion as a client-vault deletion signal.** Rejected: the node
  does not know which pending initial envelope references which signed prekey, and never holds the
  corresponding private key.
