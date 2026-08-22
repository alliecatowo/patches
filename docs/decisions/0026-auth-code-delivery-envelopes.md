# 0026. Auth-code delivery uses authenticated, terminally scrubbed outbox envelopes

**Status:** Accepted
**Date:** 2026-08-22

## Context

Email verification and password reset have two constraints that pull in opposite directions.
The usable code must be random, short-lived, single-use, and stored only as a hash once it has
been delivered (ADR 0010, ADR 0011, `INITIAL_VISION.md` §177). The server must nevertheless
commit issuance and asynchronous delivery atomically through the PostgreSQL outbox
(`INITIAL_VISION.md` §13, ADR 0004), and the worker therefore needs the plaintext once to build
the email.

The current implementation puts that plaintext directly in `outbox_jobs.payload`. Successful
and dead jobs retain it indefinitely, so a database read or `patches-admin jobs show` reveals a
live or historical credential secret. Hashing the code in both places cannot work because the
worker cannot reverse a hash. Moving reversible material to a second table only changes which
table leaks it.

This decision was checked on 2026-08-22 against the pinned runtime's
[Node.js 24 crypto API](https://nodejs.org/download/release/v24.16.0/docs/api/crypto.html),
which documents GCM AAD and warns that callers must explicitly constrain accepted GCM tag
lengths, and [NIST SP 800-38D](https://csrc.nist.gov/pubs/sp/800/38/d/final), which specifies
GCM authenticated encryption.

## Decision

`SEND_VERIFICATION_EMAIL` and `SEND_PASSWORD_RESET_EMAIL` use a versioned encrypted payload,
not plaintext and not a payload-indirection table. The durable JSON contract for version 1 is:

```json
{
  "v": 1,
  "kid": "2026-08-a",
  "authCodeId": "uuid",
  "iv": "base64",
  "ciphertext": "base64",
  "tag": "base64"
}
```

The encrypted plaintext is a strict, bounded JSON object containing only `email` and `code`.
`userId`, the recipient address, and the code never appear outside the ciphertext. The shared
implementation lives next to the outbox payload schemas in `packages/database`; it uses
Node's `aes-256-gcm` with a 32-byte key, a fresh 12-byte `randomBytes` IV for every envelope,
and an explicitly configured and validated 16-byte authentication tag. It authenticates this
UTF-8 AAD before encrypting or decrypting:

```text
patches.auth-code-delivery.v1\0<job type>\0<auth code UUID>\0<key id>
```

The payload schema is strict. Key ids match `[A-Za-z0-9._-]{1,64}`; base64 decoding must be
canonical and must produce the exact IV/tag lengths. Swapping an envelope between job types,
auth-code rows, key ids, or nodes with different keys therefore fails authentication. A
decryption, parsing, unknown-key, or integrity failure becomes a fixed machine-safe error; it
must not include payload fields or a provider error's request body.

The server and worker receive the same dedicated keyring through
`AUTH_CODE_DELIVERY_KEYS`, a JSON object from key id to base64-encoded 32-byte key. The server
selects new envelopes with `AUTH_CODE_DELIVERY_ACTIVE_KEY_ID`; the worker decrypts by the
payload's `kid`. Both processes validate the complete keyring at boot, including that the
active id exists. These keys are never committed, logged, exposed through an RPC, reused as
JWT/federation/E2EE keys, or generated independently by either process. Local setup generates
one shared development key explicitly; there is no silent or known default.

Rotation is additive: install a new id/key on every server and worker while the old key
remains, deploy and verify both processes, switch the active id, then retain the old key until
no `PENDING` or `PROCESSING` auth-email envelope names it. `COMPLETED` and `DEAD` rows cannot
hold ciphertext under this decision. Removing a key is irreversible; a restored backup with
an unknown old `kid` terminally invalidates and scrubs that obsolete delivery and requires a
new code rather than restoring retired key material indefinitely.

Issuance remains one database transaction: generate the code, store only its SHA-256 hash in
`auth_codes`, encrypt `{ email, code }`, and insert the outbox row. Before sending, the worker
loads `authCodeId` and verifies the row has the job type's purpose, is unconsumed and unexpired,
and that the decrypted code hashes to `code_hash`. A missing, consumed, or expired row is a
successful no-op. At-least-once delivery remains: a crash after the provider accepted the
email but before completion may send one duplicate.

Terminal cleanup is part of the status transition, not a later sweep:

- On success, the same database update that sets `COMPLETED` replaces the payload with
  `{ "v": 1, "redacted": true }`. The hashed `auth_codes` row remains usable until consumed
  or expired.
- A retryable failure retains the encrypted envelope and records only a sanitized error.
- On the final failure, one transaction sets `DEAD`, replaces the payload with the tombstone,
  and deletes the referenced `auth_codes` row. A scrubbed auth-email job is intentionally not
  replayable; the user requests or resends a fresh code instead.
- Logs, metrics, traces, `last_error`, and admin output may contain job id, type, attempt,
  outcome, and latency, but never the envelope, code, decrypted plaintext, key id, or a raw
  provider error that may echo request content.

The migration is fail-closed. It irreversibly tombstones every legacy plaintext auth-email
payload. Legacy non-terminal/dead deliveries become `DEAD` and their referenced auth-code rows
are deleted; legacy completed deliveries keep their hashed code row so a code already sent can
still be consumed. A database check constraint rejects the old top-level `code`, `email`, and
`userId` payload shape. There is no worker compatibility branch that reads legacy plaintext.
Rollback may drop the constraint but cannot and must not reconstruct scrubbed secrets.

This is a coordinated migration, not a mixed-version rolling contract. Install the keyring
secrets first, drain or stop every old server/worker, run the scrub-and-constraint migration,
then start the new server and worker. The deployment must not rely on the constraint rejecting
an old server's inserts while that server still accepts requests: during that window a known
password-reset address would attempt an insert and fail while an unknown address would still
return the uniform no-op, creating the enumeration signal §177 forbids. A platform that cannot
drain old processes must use a two-release expand/contract rollout and run the scrub/constraint
only after every plaintext producer is gone.

## Consequences

- A database dump or admin job inspection alone no longer yields a verification/reset code.
  Compromising both the database and a currently installed delivery key can still expose
  pending envelopes; short TTLs, terminal scrubbing, and timely key retirement bound that
  window. This is application-level encryption, not a claim that a fully compromised server
  or worker is safe.
- No new table or network dependency is introduced, and the server mutation plus outbox insert
  remains atomic. The shared cipher and payload schema become a durable server/worker contract
  and need compatibility tests.
- The worker needs a read of `auth_codes` before sending. That makes the documented
  consumed/expiry idempotency rule real and avoids emailing already-invalid codes.
- Operators must manage one small, rotatable keyring across the server and worker. A bad
  rollout fails at boot or safely retries without falling back to plaintext.
- Final auth-email failures lose generic dead-letter replay. That is deliberate: retaining a
  usable credential for operator replay conflicts with terminal scrubbing, while issuing a
  fresh code is cheap and safer.
- The migration can make an in-flight registration or reset email require one resend. It
  prefers an explicit recoverable user action over preserving a known plaintext secret.
- The first deployment needs a short coordinated drain (or a two-release expand/contract
  rollout); blindly relying on a normal mixed-version rolling release would violate the auth
  flow's no-enumeration requirement.

## Alternatives considered

- **A dedicated delivery table or encrypted columns on `auth_codes`.** Rejected: reversible
  material still exists in the same database, while adding a migration, join, lifecycle, and
  cleanup path. An encrypted, strictly typed outbox envelope has the same compromise boundary
  and is already the transactional delivery record.
- **Derive the code deterministically from a master key and `authCodeId`.** Rejected: unless a
  separate random derivation nonce is retained it defeats terminal crypto-erasure, because the
  id remains in `auth_codes`; with such a nonce it recreates an encrypted envelope's key
  lifecycle in a less conventional construction without improving the compromise boundary.
- **Reuse `FEDERATION_KEY_ENCRYPTION_KEY`.** Rejected: federation is optional, the secrets have
  unrelated rotation and exposure domains, and coupling them expands the blast radius of either
  subsystem.
- **One unversioned encryption key.** Rejected: pending jobs make stop-the-world key replacement
  unsafe. An explicit `kid` and overlap period make rotation routine and testable.
- **External KMS, Vault, or a separate secret-delivery service.** Rejected for v0: it adds a
  network dependency and centralized operational component to a lightweight self-hosted node.
  The keyring contract leaves room for a future key-provider adapter without requiring one.
- **Keep plaintext only until `CLEAN_EXPIRED_TOKENS` runs.** Rejected: it leaves credentials in
  successful/dead jobs for an unbounded interval and makes cleanup a best-effort second event
  rather than part of the terminal state transition.
