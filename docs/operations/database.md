# Database

**Status: mostly planned, local migration tooling implemented.** Describes the target
PostgreSQL setup and migration policy per `INITIAL_VISION.md` §§14–16, §90, §123. As of
2026-08-17 (Phase 0) no production database exists yet; local Docker Compose Postgres is
the only environment in use. `packages/database`'s DataSource, snake_case naming strategy,
and TypeORM CLI wiring (`pnpm db:migrate`/`db:revert`/`db:show`/`db:generate`) are
implemented and verified against a local Postgres — see "Local commands" below.

## Engine and hosting

- **Engine:** PostgreSQL, same major version locally and in production wherever practical.
- **Production:** Fly Managed Postgres. Fly's managed offering is preferred over
  self-managing Postgres on a Fly Volume — self-management is a fallback only if Managed
  Postgres is genuinely unavailable, not a default choice.
- **Local:** Docker Compose PostgreSQL (see `docs/operations/local-development.md`).

## ORM and access pattern

TypeORM 1.x, Data Mapper / repository style — see
`docs/decisions/0003-typeorm-postgres.md` for the full rationale. Entities are persistence
only; business logic lives in NestJS services.

## Migrations policy

- **`synchronize: false`, `migrationsRun: false`** in all environments. TypeORM's automatic
  schema synchronization is explicitly unsafe for production schema evolution and is never
  enabled outside disposable local/test scenarios.
- **CI verifies migrations.** Migration validation is a required PR check (see CI section in
  `docs/operations/deployment.md`).
- **Migrations run as an explicit release step**, before new application instances take
  live traffic. Instances must never race each other to apply migrations at startup — that
  is a correctness bug, not a convenience shortcut.
- **Generated migrations are reviewed by a human before merge.** Auto-generated TypeORM
  migrations are a starting draft, not an approved change.
- **PostgreSQL-specific indexes may be written by hand** in migrations where TypeORM's
  generator doesn't express them well (partial indexes, specific index types, etc.).

## Local commands (Status: implemented, Phase 0 — verified against a real local Postgres)

`packages/database` wires the TypeORM 1.x CLI via `tsx` (not `ts-node` — see the package
README for why) and `src/cli/data-source.ts`, which reads `DATABASE_URL` from the
environment (loading the repo-root `.env` first, if present, without overriding anything
already set). Root scripts wrap the package scripts:

```bash
pnpm db:migrate              # apply every pending migration
pnpm db:revert                # undo the last executed migration
pnpm db:show                  # list migrations, [X] executed / [ ] pending
pnpm db:generate --name=Foo   # diff entities vs DB, write src/migrations/<ts>-Foo.ts
```

`packages/database` also exposes `migration:create --name=Foo` (writes an empty
`src/migrations/<ts>-Foo.ts` template, no DB connection required) — not wired to a root
script yet since nothing has needed a hand-written-from-scratch migration outside
`CreateAppMeta` so far.

All four `db:*` commands above were run against the local dev database
(`postgres://patches:patches@127.0.0.1:5432/patches`, from `.env.example`) in this order —
`db:migrate` → `db:show` (reports `[X] 1 CreateAppMeta...`, zero pending) → `db:revert`
(drops `app_meta` again) → `db:migrate` (recreates it) — and left the dev DB migrated.
`db:generate --name=X` was also verified to correctly report "No changes in database schema
were found" when the `app_meta` entity and the migration that created it agree, and to
detect a real drift (a missing `default: () => 'now()'`) when they didn't.

## Expand/contract for schema changes

Non-trivial schema changes (renames, type changes, dropped columns) use expand/contract,
not a single atomic cutover:

Bad:

```text
deploy code that expects a renamed column
rename the column immediately
```

Better:

```text
add the new column
deploy code that writes/reads compatibly with both old and new
backfill existing rows
switch reads to the new column
remove the old column in a later release
```

This matters as soon as there is real production data — a single-step rename means any
in-flight old-code instance breaks the moment the migration runs.

## Rollback policy

**Status: planned — to be finalized before Phase 7 (deploy public v0).** At minimum:

- Migrations should be written to be forward-only in the common case; a "down" migration is
  not always safe to auto-run against real data (e.g. a backfilled column can't be silently
  un-backfilled without data loss).
- If a bad migration reaches production, the default response is a **forward fix**
  (a new migration correcting the problem), not a blind `migration:revert` against a
  database that may already have new data depending on the new shape.
- Application code changes and schema changes are deployed in a sequence that tolerates
  rollback of the _application_ deploy without requiring an immediate schema rollback
  (this is what expand/contract buys you) — application rollback should not be blocked on
  reversing a migration.
- Document the specific rollback runbook here once Phase 1 migrations exist to test the
  procedure against.

## Data-loss expectations (alpha)

**Status: planned — see `docs/operations/backups.md`** for RPO/RTO targets and backup
verification cadence. Backups must be enabled and verified before Phase 7 (public v0
deploy); this is a checklist item in `docs/product/roadmap.md`, not optional polish.

## Performance notes

- Cursor/keyset pagination (`created_at DESC, id DESC` style, not offset pagination) is
  required for feeds — offset pagination is explicitly prohibited
  (`INITIAL_VISION.md` §153).
- Required indexes should be added deliberately alongside the query patterns that need
  them (feed queries, thread lookups, actor lookups) rather than added reactively after a
  production slowdown.
- Before optimizing anything, generate realistic fixture data and check `EXPLAIN ANALYZE`
  output — don't add infrastructure (e.g. Redis caching) speculatively for a query that
  hasn't been measured.
