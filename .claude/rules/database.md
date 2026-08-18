---
paths:
  - 'packages/database/**'
---

# Database rules (TypeORM 1.x)

See `docs/research/typeorm-postgres.md` before touching anything here — TypeORM 1.x is a real major version, not the 0.3.x most training data assumes.

- **Data Mapper, not Active Record.** Repositories, not entity methods that save themselves.
- **Migrations only** — `synchronize: false` always (guard-bash blocks new `synchronize: true` occurrences, but don't rely on the hook). Every schema change is `pnpm db:generate --name=<Name>` + reviewed SQL + `pnpm db:migrate`, see `/migration`.
- **snake_case in Postgres, camelCase in TypeScript** via the custom `SnakeNamingStrategy` (there is no 1.x-compatible `typeorm-naming-strategies` package — don't add it back).
- **UUID primary keys** (`@PrimaryGeneratedColumn('uuid')`), **`timestamptz`** for every timestamp column, never bare `timestamp`.
- **Explicit relations, no `eager`/`cascade`** unless a comment documents why — implicit cascades are a common source of surprise deletes/updates.
- **`where: { x: null }` throws in 1.x** — use `IsNull()` from `typeorm`. This is a real behavior change from 0.3.x, not a typo.
- **Non-nullable relations now INNER JOIN** via the `relations` find-option (used to be LEFT JOIN) — audit any query that expects to keep rows with a missing optional-in-practice relation; use QueryBuilder with an explicit `leftJoin` if you need the old behavior.
- **Keyset pagination only** — no `OFFSET`/`skip` for feeds or lists (spec §46, §153). Cursor on `(created_at, id)` or the documented keyset shape.
- **Indexes**: every index required by spec §60 must exist before the migration ships; verify feed queries with `EXPLAIN` when in doubt.
- **Review every generated migration by hand** before running it — TypeORM's diff can propose destructive changes (dropped/renamed columns it doesn't distinguish) that need to become an expand/contract pair instead.
- **Test isolation**: integration tests use `TEST_DATABASE_URL`, never the dev DB (spec §119).
