---
name: typeorm-generate-missing-check-diff
description: TypeORM 1.x `migration:generate` does not diff existing @Check() constraint bodies on unchanged tables — widening a CHECK (e.g. adding an enum value) must be hand-added to the generated migration
metadata:
  type: feedback
---

Found implementing B-025..B-030 (backend hardening backlog): widened
`ADMIN_AUDIT_SUBJECT_TYPES` (adding `'DOMAIN'`) and its `@Check(checkIn('subject_type', ...))`
constraint on `AdminAuditLog`, alongside unrelated new columns on two other tables. Ran
`pnpm db:generate --name=Phase9Hardening` — the generated migration correctly picked up the new
columns/CHECK on the _new_ columns, but silently omitted the `admin_audit_log` CHECK constraint
widening entirely, even though the entity's `@Check(...)` expression string had changed.

Verified by querying `pg_get_constraintdef` directly against the dev DB after running the
generated migration — the live constraint still only allowed the old 5 values, confirming
TypeORM's schema differ does not compare CHECK constraint _bodies_ against existing entities,
only detects CHECK constraints on newly-added columns/tables.

**How to apply:** After `migration:generate`, if an entity change widens/narrows an existing
`@Check(...)` on an _unchanged_ column, don't trust the generated migration to include it —
manually add `ALTER TABLE ... DROP CONSTRAINT ...` + `ALTER TABLE ... ADD CONSTRAINT ...` (both
`up()` and `down()`) with a comment explaining why it's hand-added. Verify by inspecting
`pg_get_constraintdef` on the migrated dev DB, not just that `migration:generate --name=Probe`
reports no further changes (that check would also miss this).
