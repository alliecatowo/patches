---
name: migration
description: Procedure for TypeORM schema changes — edit entities, generate, review the SQL, run, test, and update the data-model doc. Use for /migration <Name>.
invocation: user
allowedTools: Read, Edit, Bash
---

# /migration $ARGUMENTS

`$ARGUMENTS` is the migration name (PascalCase, e.g. `AddPostMediaTable`). Procedure for any `packages/database` entity change (spec §14–18, §60, `.claude/rules/database.md`).

1. Edit the entity/entities in `packages/database/src/entities/`. Snake_case columns come from the naming strategy automatically — name TS properties in camelCase, don't hand-snake-case them. UUID PKs, `timestamptz` for all timestamps, explicit `relations` (no `eager`/`cascade` unless the spec or an ADR documents why).
2. `pnpm db:generate --name=$ARGUMENTS` — TypeORM diffs the entities against the DB schema and writes a migration file. This requires a reachable Postgres with the *previous* migration state applied — `mise run compose -- up -d` first if it's not running.
3. **Review the generated SQL before running it** — this step is not optional:
   - snake_case table/column names (confirm the naming strategy applied correctly)
   - indexes present for anything queried by (spec §60's required index list — foreign keys, feed queries, unique constraints)
   - no destructive change (dropped column/table, changed column type narrowing) without an expand/contract plan across two migrations — never do a breaking schema change in one step, one deploy
   - no `synchronize` anywhere (guard-bash blocks new occurrences, but double check)
4. `pnpm db:migrate` to apply it locally.
5. Write/run an integration test that exercises the new shape (spec §119 — integration tests need `TEST_DATABASE_URL`, never point at the dev DB).
6. Update `docs/architecture/data-model.md` to match.
7. `pnpm db:show` should report no pending migrations after this.

Commit the entity change, the migration file, the test, and the doc update together.
