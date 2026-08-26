---
name: local-podman-postgres-credentials
description: How to hand-verify a migration against the running local podman Postgres without TEST_DATABASE_URL set
metadata:
  type: project
---

The dev machine usually has `patches-postgres-1` (and `-minio-1`/`-mailpit-1`) already running via
`mise run compose` (check with `podman ps`). `mise run check <pkg>` skips `packages/database`
integration tests silently when `TEST_DATABASE_URL` isn't exported in the shell — passing it
inline (`TEST_DATABASE_URL="postgres://patches:patches@127.0.0.1:5432/patches_test" pnpm exec
vitest run ...`, credentials from `.env.example`) runs them for real against that container.

**Why:** needed to actually prove a `DROP FUNCTION IF EXISTS ...` migration cleanup worked
against a database that had the orphaned object, not just against a fresh `dropDatabase()`
test DB where the object never existed in the first place (B-136f). Manually recreated the
function via a one-off `node -e` script using `pg`'s `Client`, ran the migration's exact SQL,
and confirmed `to_regprocedure(...)` resolved to `null` afterward.

**How to apply:** when a fix's correctness depends on pre-existing DB state (an orphaned
function/trigger/column from a deleted migration, a legacy data shape) that a freshly-migrated
test database can't reproduce, don't settle for "the integration suite passes" — simulate the
stale state by hand against the local podman Postgres first.
