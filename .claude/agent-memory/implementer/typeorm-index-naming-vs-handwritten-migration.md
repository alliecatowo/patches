---
name: typeorm-index-naming-vs-handwritten-migration
description: hand-written migration SQL for indexes/functions must match SnakeNamingStrategy's deterministic names and survive dataSource.dropDatabase(), or db:generate drifts and integration tests fail on rerun
metadata:
  type: feedback
---

Two compounding gotchas found recovering P13-002 (E2EE schema) WIP against real Postgres:

1. **Index names must match `SnakeNamingStrategy.indexName` exactly, or `pnpm db:generate`
   drifts forever.** `packages/database/src/naming/snake-naming.strategy.ts` derives an
   index's name from its **sorted, full snake_case column list** — never from a predicate
   (`where`) and never preserving declared column order in the name (though the actual
   `CREATE INDEX` column order does follow the `@Index([...])` array order). A hand-written
   migration that uses a shorter/abbreviated custom index name (e.g.
   `idx_e2ee_device_identities_active_actor_device` instead of the deterministic
   `idx_e2ee_device_identities_actor_id_device_id`) will apply fine but `db:generate` will
   propose dropping and recreating it forever. Cheapest fix when recovering hand-written
   migration WIP: delete the migration file, temporarily strip its export from
   `migrations/index.ts`/`src/index.ts`, run `migration:generate` fresh against the corrected
   entities, then hand-append only what decorators can't express (triggers, and any
   `@Check()` body change on an existing column — `migration:generate` never diffs those, see
   [[typeorm-generate-missing-check-diff]]).
2. **Two partial indexes over the same columns collide on name.** Since the name ignores
   `where`, a general index and a partial ("active"/"pending") index over the _same_ column
   set need a deliberately different column set (drop or add a column) to get distinct
   names — see `credential.entity.ts`'s and `notification.entity.ts`'s partial-unique-index
   comments for the established pattern in this codebase.
3. **A bare `CREATE FUNCTION` in a migration breaks integration tests on the second run.**
   `dataSource.dropDatabase()` → Postgres driver's `clearDatabase()` only drops views,
   materialized views, tables (`CASCADE`, which takes trigger objects with their table), and
   enum types — it never touches standalone SQL functions. A trigger function created with
   plain `CREATE FUNCTION` survives the "reset" and the next `runMigrations()` fails with
   `function ... already exists with same argument types`. Always use
   `CREATE OR REPLACE FUNCTION` for anything created in a migration `up()` if any integration
   test in the package resets the DB via `dataSource.dropDatabase()`.

**Why this matters**: none of this shows up from reading the migration SQL or from a single
`migration:run` — it only surfaces by actually running `pnpm db:generate` after migrating,
and by running the integration test suite **twice in a row** against the same test DB. Both
checks are cheap and should be routine before calling a schema/migration task done, not just
"did `migration:run` succeed once."

**How to apply**: any time you hand-write migration SQL (rather than letting
`migration:generate` produce it) for indexes or DDL objects TypeORM doesn't manage
(functions, triggers), verify with the actual toolchain — `db:generate` for an empty diff,
and a repeated `pnpm test` run for idempotency — before considering the migration done.
