---
name: postgres-cross-connection-self-deadlock
description: A transaction's own failed conditional UPDATE can hold a row lock it doesn't need — a nested, separate transaction touching that row then self-deadlocks against its own caller
metadata:
  type: feedback
---

A Postgres `UPDATE ... WHERE <predicate>` that examines a row as a candidate takes a row lock
on it _before_ the final predicate re-check — even if the predicate ultimately fails and the
row is never actually updated (an `EvalPlanQual` no-op still leaves the lock held for the rest
of the current transaction). This is easy to miss: it feels like a failed/no-op UPDATE should
leave nothing behind, but it doesn't.

**Why this matters:** if code inside that still-open transaction then opens a _second_,
independent transaction (a different pooled connection — e.g. `dataSource.transaction()`
called from within another `dataSource.transaction()`'s callback) to modify the _same_ row
(directly, or via a broader `WHERE` that happens to include it), that second transaction blocks
waiting for the first transaction's lock — while the first transaction is sitting `await`ing
the second to finish. Neither Postgres's deadlock detector nor anything else catches this: from
Postgres's point of view the first connection isn't blocked on any DB-level lock, it's just
idle-in-transaction while its owning process waits on a JS Promise. So there's no lock-wait
_cycle_ for Postgres to detect — the second transaction just hangs until something external
(a client-side gRPC deadline, a `lock_timeout` if one is configured) kills it.

**Symptom:** a test (or production request) that should fail fast with a clean error instead
hangs for the full request timeout and then fails with something generic (`DEADLINE_EXCEEDED`),
not the error the code appears to throw.

**How to apply:** whenever "detect something via a conditional UPDATE inside transaction A,
then open a _separate_ transaction B to clean up/revoke/cascade based on what A found" — check
whether A's own UPDATE attempt (successful or not) could have touched a row B also needs to
touch. If so, either (a) do the cleanup with A's own manager/connection (same transaction) if it
doesn't need to outlive A's rollback, or (b) defer opening transaction B until _after_ A has
fully settled (resolved or rejected) — never call it synchronously from inside A's still-open
transaction body. Found this while fixing refresh-token reuse detection
(`apps/server/src/modules/auth/token.service.ts` — see git history around 2026-08-18): a
concurrent-replay test that should finish in milliseconds hung for the full 10s gRPC deadline
until the revoke was moved out of the detecting transaction into the caller, run only after
that transaction rolled back. A raw two-connection `pg` reproduction (no ORM, no gRPC) confirms
the mechanism directly if this needs re-verifying.
