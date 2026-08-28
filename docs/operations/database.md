# Database

**Status: implemented.** Production runs on Neon PostgreSQL (`aws-us-east-2`, A-041, S-001, B-065) with continuous WAL PITR and branch-based workflow support; local development and CI use Docker Compose PostgreSQL. `packages/database`'s DataSource, snake_case naming strategy, and TypeORM CLI wiring (`pnpm db:migrate`/`db:revert`/`db:show`/`db:generate`) are implemented and verified against both environments.

## Engine and hosting

- **Engine:** PostgreSQL 17+, same major engine locally and in production.
- **Production:** Neon PostgreSQL (`aws-us-east-2`, default branch `production`, `sslmode=require`). The stopped original Fly Postgres cluster (`patches-social-db`) is retained only as a cold fallback — see `docs/operations/deployment.md`.
- **Local:** Docker Compose PostgreSQL (`infra/compose/docker-compose.yml`, see `docs/operations/local-development.md`).
- **Cloud dev branches:** Ephemeral Neon branches via `mise run neon:dev:*` (see `docs/operations/neon-environments.md`).

### Three-tier ergonomics status (#156)

| Tier                        | Purpose                                                  | Status                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local Compose               | Everyday development and the integration suite           | **Status: implemented.** `mise run compose -- up -d` → `pnpm db:migrate` → `pnpm dev`; see `docs/operations/local-development.md`. The four `db:*` CLI commands are verified against it (see "Local commands" below).                                                                                                                                                         |
| Ephemeral Neon dev branches | Cloud-faithful test branches, created/destroyed per task | **Status: helpers implemented and locally tested (27 assertions); provider setup incomplete.** `mise run neon:dev:{create,status,migrate,test,reset,destroy}` are implemented and guarded, but no real anonymized dev mirror has ever been created against a live Neon project (`NEON_DEV_MIRROR_BRANCH` is unset in this repo) — see `docs/operations/neon-environments.md`. |
| Production                  | Live node                                                | **Status: implemented, unprotected.** Neon PostgreSQL is live and serving traffic (see `docs/operations/deployment.md`), but Neon's branch-protection API returned a plan-limit HTTP 422 when attempted, so the production branch has no provider-level protection today — only the helper's own name/ID checks stop these scripts from targeting it.                         |

**Gap closing this issue tracks:** creating a real anonymized dev mirror (masking review
required before any data copy — see the leakage-check list in
`docs/operations/neon-environments.md`) and resolving the Neon plan limit that blocks
branch protection (a plan upgrade or an equivalent provider-side control) are both
provider-account actions this environment has no credentials for — `neon auth` requires an
interactive browser OAuth flow (confirmed by running it here: it times out waiting for a
browser callback, with no non-interactive `NEON_API_KEY` configured). Both remain
**Status: planned** until performed by someone with Neon console/account access; the
local → mirror → production path is not yet operational end-to-end, only the local tier
and the mirror-tooling's own tests are.

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

## Online-DDL discipline

**Verified 2026-08-26** against PostgreSQL 17's official docs
(`sql-altertable.html`, `sql-createindex.html`, `explicit-locking.html`) and this repo's
installed TypeORM 1.1.0 CLI source. This section is the actionable reference — read it
before writing a migration that touches a table with live traffic; don't re-derive lock
behavior from memory or the (differently-behaved) 0.3.x-era common knowledge about
TypeORM's transaction wrapping.

### Lock levels that matter (PostgreSQL, verified)

Postgres's own rule, stated at the top of the `ALTER TABLE` reference: **"An ACCESS
EXCLUSIVE lock is acquired unless explicitly noted."** ACCESS EXCLUSIVE blocks every
other lock mode, including plain `SELECT` — it is the one to avoid holding for any
non-trivial duration on a live table. The documented exceptions that matter here:

| Operation                                                                | Lock                              | Blocks reads?                                 | Notes                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADD COLUMN` (no default, or non-volatile default e.g. a literal)        | ACCESS EXCLUSIVE                  | briefly (metadata-only, no rewrite)           | "In neither case is a rewrite of the table required" — the ACCESS EXCLUSIVE lock is real but held only for the metadata change, not a table scan.                                           |
| `ADD COLUMN ... DEFAULT now()` (or any volatile default)                 | ACCESS EXCLUSIVE                  | **yes, for the full rewrite**                 | Volatile defaults force "the entire table and its indexes to be rewritten" under the lock — this is the dangerous case, not the plain `ADD COLUMN` case.                                    |
| `ALTER COLUMN ... TYPE`                                                  | ACCESS EXCLUSIVE                  | **yes, usually for a full rewrite**           | Rewrite is skipped only if the `USING` clause doesn't change the stored bytes and the old type is binary-coercible to the new one; even then, dependent indexes are usually rebuilt.        |
| `SET NOT NULL`                                                           | ACCESS EXCLUSIVE                  | yes, for a full table scan                    | Scan is skipped only if a `NOT VALID` `CHECK` constraint already proves no `NULL` exists.                                                                                                   |
| `ADD CONSTRAINT ... CHECK`/`UNIQUE` (validated immediately, the default) | ACCESS EXCLUSIVE                  | yes, for a full table scan                    | Use `NOT VALID` (below) to avoid this.                                                                                                                                                      |
| `ADD CONSTRAINT ... NOT VALID`                                           | ACCESS EXCLUSIVE, briefly         | no (skips the scan)                           | Enforced against new writes immediately; existing rows unchecked until `VALIDATE CONSTRAINT`.                                                                                               |
| `VALIDATE CONSTRAINT`                                                    | SHARE UPDATE EXCLUSIVE            | no                                            | Explicitly documented as the point of `NOT VALID` + `VALIDATE CONSTRAINT`: "validation acquires only a SHARE UPDATE EXCLUSIVE lock."                                                        |
| `ADD FOREIGN KEY` (validated immediately)                                | SHARE ROW EXCLUSIVE (both tables) | no writes to the FK columns, reads unaffected | Cheaper than the "most forms of ADD constraint" ACCESS EXCLUSIVE default, but still not free — combine with `NOT VALID` for the largest tables.                                             |
| `CREATE INDEX` (no `CONCURRENTLY`)                                       | SHARE                             | **blocks writes**, not reads                  | "locks out writes (but not reads) on the table until it's done."                                                                                                                            |
| `CREATE INDEX CONCURRENTLY`                                              | SHARE UPDATE EXCLUSIVE            | no                                            | Takes ~2x the work (two table scans) and cannot run inside a transaction block (see the TypeORM gotcha below). Can fail and leave an `INVALID` index — `DROP INDEX CONCURRENTLY` and retry. |
| `RENAME COLUMN` / `RENAME TABLE`                                         | ACCESS EXCLUSIVE, briefly         | metadata-only                                 | Lock is real but brief; the actual hazard is old application code that still refers to the old name (§ expand/contract below), not lock duration.                                           |

Sources:
[`sql-altertable.html`](https://www.postgresql.org/docs/17/sql-altertable.html),
[`sql-createindex.html`](https://www.postgresql.org/docs/17/sql-createindex.html),
[`explicit-locking.html`](https://www.postgresql.org/docs/17/explicit-locking.html).

### The expand-contract sequence for each dangerous case

Never do these in one migration/one deploy on a table with live traffic:

1. **Add column with a default that must apply to existing rows.**
   - Migration 1: `ADD COLUMN foo TYPE DEFAULT <non-volatile-literal>` (or nullable with no
     default). A non-volatile default is metadata-only — no rewrite, brief lock. If the
     value needs deriving per-row (a "volatile" default, or backfill logic too complex for
     a single literal), add the column nullable-with-no-default instead and backfill in
     batches from application code/a worker job, never a single `UPDATE table SET ...`
     that touches every row in one transaction.
   - Deploy code that writes the column going forward.
   - Migration 2 (later release): add `SET NOT NULL` once every row is backfilled — pair
     it with a `NOT VALID` `CHECK` first if the table is large enough that the full-table
     scan `SET NOT NULL` normally does is worth avoiding.

2. **Type changes.** Add a new column with the new type, deploy dual-write code, backfill,
   switch reads, drop the old column in a later migration. Do not `ALTER COLUMN ... TYPE`
   directly on a live table unless the change is provably binary-coercible (verify with
   `EXPLAIN`/a staging run, don't assume) — otherwise it's a full table+index rewrite
   under ACCESS EXCLUSIVE.

3. **`NOT NULL`.** `ADD CONSTRAINT ... CHECK (col IS NOT NULL) NOT VALID` first (cheap
   lock), `VALIDATE CONSTRAINT` in the same or a later migration (SHARE UPDATE EXCLUSIVE,
   no read/write blocking), then `SET NOT NULL` once the constraint is validated — Postgres
   skips the redundant table scan when a validated `CHECK` already proves it.

4. **New index.** Always `CREATE INDEX CONCURRENTLY` on a live table, never plain
   `CREATE INDEX` — see the TypeORM-specific gotcha immediately below, since this is the
   one that will silently produce the wrong thing (or outright fail) if the migration
   author doesn't know about it.

5. **Renames.** Never rename a column/table that old-code instances still reference in the
   same deploy as the schema change. Expand (add the new name, e.g. a view or a
   dual-written column), migrate reads, then contract (drop the old name) once no deployed
   instance can reference it — this repo's existing "Expand/contract for schema changes"
   guidance above already states the general shape; this is the same principle applied to
   the specific lock-bearing operations above.

### TypeORM-specific gotcha: `CREATE INDEX CONCURRENTLY` needs `--transaction=none`

**Verified by reading `node_modules/typeorm`'s own compiled CLI source** (this repo's
installed 1.1.0, `migration/MigrationExecutor.js` and
`commands/MigrationRunCommand.js` — the actual shipped package, not a doc claim):

- TypeORM's migration runner defaults to `transaction: "all"` — **every pending migration
  in one call runs inside a single database transaction** — unless overridden. This repo's
  `packages/database` does not set `migrationsTransactionMode` on the `DataSource`, and
  `pnpm db:migrate` (→ `migration:run -d src/cli/data-source.ts`) does not pass `-t`/
  `--transaction`, so **today's default is `all`.**
- `CREATE INDEX CONCURRENTLY` cannot run inside any transaction block — Postgres itself
  rejects it ("regular CREATE INDEX command can be performed within a transaction block,
  but CREATE INDEX CONCURRENTLY cannot", per the official docs above). Running a migration
  containing it through the default `all` mode will fail outright.
  - The CLI does support a per-migration instance override
    (`MigrationInterface.transaction?: boolean`), but the executor explicitly **throws**
    (`ForbiddenTransactionModeOverrideError`) if any pending migration tries to override
    the mode while the run-level mode is `"all"` — you cannot mix "everything else in one
    transaction" with "except this one" in the same `db:migrate` invocation.
  - The verified, correct way to run a migration containing `CREATE INDEX CONCURRENTLY`
    (or `REINDEX CONCURRENTLY`, or `DROP INDEX CONCURRENTLY`, or `VALIDATE CONSTRAINT`
    inside an otherwise-transactional batch that must not block): run it **by itself**, in
    its own deploy step, with the transaction mode forced to `none`:
    ```bash
    pnpm --filter @patches/database exec pnpm typeorm migration:run \
      -d src/cli/data-source.ts -t none
    ```
    **Exercised end-to-end against this repo's real compose Postgres** (a scratch
    `CREATE INDEX CONCURRENTLY ... ON "actors" ("id")` migration, not committed): running
    it through the default `pnpm typeorm migration:run -d src/cli/data-source.ts` (no
    `-t`) fails immediately with Postgres error `25001`
    (`PreventInTransactionBlock`/"CREATE INDEX CONCURRENTLY cannot run inside a transaction
    block"), exactly as predicted from the source read above. Re-running the identical
    migration with `-t none` succeeds: the `CREATE INDEX CONCURRENTLY` query runs, and the
    `migrations` bookkeeping row is inserted in its own (implicit, autocommit) statement
    afterward — no transaction wraps either statement, and both commit independently.
    `migration:revert -d src/cli/data-source.ts -t none` also succeeds
    (`DROP INDEX CONCURRENTLY IF EXISTS ...` + bookkeeping delete), confirming the
    up→down→up-shaped reversibility check works the same way for this class of migration
    as for an ordinary one.
  - Do not add `migrationsTransactionMode: "each"` globally as a workaround without
    thinking it through: `"each"` still wraps every individual migration in its own
    transaction by default, which **still fails** for `CREATE INDEX CONCURRENTLY` unless
    that migration's own `transaction = false` instance property is also set. `-t none`
    for that one deploy is the simplest correct answer; don't change the repo-wide default
    over one migration.

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
