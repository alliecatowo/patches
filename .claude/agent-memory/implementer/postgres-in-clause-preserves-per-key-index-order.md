---
name: postgres-in-clause-preserves-per-key-index-order
description: batching N per-id equality queries into one WHERE col IN (...) query is safe for order-sensitive per-group aggregation when the column is the leading key of a btree index the planner would use anyway
metadata:
  type: feedback
---

When fixing an N+1 where the per-item query result order matters (e.g. a security-relevant digest
computed from row order within one group), batching `WHERE col = :x` (run N times) into one
`WHERE col IN (:...ids)` is safe _for each group's own relative row order_ as long as `col` is the
leading column of a btree index the planner already uses for the equality case — Postgres
evaluates `= ANY(array)` against such an index as a per-array-element probe in array order, so
each id's own subset of the combined result comes back in the same relative order a standalone
query for that one id would give.

**Why:** used this reasoning to fix `ListMailboxEnvelopes`' N+1 (P19-019 part 2,
`apps/server/src/modules/e2ee/e2ee-fanout.ts`'s `transcriptDigestForStoredMessage`, which
recomputed a franking transcript digest with one DB round trip per envelope) without risking a
different digest value — the table has a unique index on
`(logical_message_id, recipient_device_identity_id)`, the leading column of both the old
per-message query and the new batched `IN(...)` query.

**How to apply:** before batching an order-sensitive per-item query this way, confirm the
filtered column is the leading key of an existing index (check the entity's `@Index`/unique
constraints). Don't add a _new_ explicit `ORDER BY` to make this "safer" — that changes the
already-implementation-defined order in a way that could produce a _different_ digest than the
old unordered code across a deploy, for data that already has multiple rows per key. Prove the
invariant with a unit test comparing a batched multi-group call against an isolated single-group
call (mock the repository/queryBuilder) rather than relying on a real DB, if one isn't available.
