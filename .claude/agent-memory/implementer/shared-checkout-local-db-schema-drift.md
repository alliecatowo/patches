---
name: shared-checkout-local-db-schema-drift
description: The local podman Postgres container/volume can outlive the repo's migration files, making pnpm db:generate report unrelated phantom drift for tables you never touched
metadata:
  type: feedback
---

`pnpm db:generate` reporting drift across many unrelated tables (dropped columns, dropped
indexes, generated-column changes) that don't match anything in your diff is often not real
code drift — it's a stale local Postgres data volume.

**Why:** `patches-postgres-1`'s data volume persists across sessions/checkouts on this shared
machine. If an earlier session ran migrations that were later renamed, squashed, or removed
from `packages/database/src/migrations/`, the `migrations` table still lists those old names as
applied, so `pnpm db:migrate` reports "No migrations are pending" — but the actual table shapes
reflect the deleted migration files, not the current ones on disk.

**How to apply:** before trusting `db:generate` output, check
`SELECT name FROM migrations ORDER BY id;` against `ls packages/database/src/migrations/` — any
DB-side name with no matching file means the container is stale. Fix by dropping and recreating
the dev database (`DROP DATABASE patches; CREATE DATABASE patches OWNER patches;`) and rerunning
`pnpm db:migrate` from scratch, then re-check drift. Don't touch `patches_test` or other
worktrees' scratch databases (`patches_lab_a`, `patches_e2ee_lab`, etc.) the same way — other
agents may depend on their state; just run `db:migrate` against them to bring them current
before running integration tests. See [[typeorm-array-default-phantom-drift]] for the other
common (non-stale-DB) cause of phantom drift.
