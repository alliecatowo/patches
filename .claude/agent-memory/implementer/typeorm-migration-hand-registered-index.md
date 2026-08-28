---
name: typeorm-migration-hand-registered-index
description: a new migration file alone is a no-op — packages/database/src/migrations/index.ts imports and lists every migration by hand
metadata:
  type: feedback
---

`pnpm db:generate --name=X` writes the migration file, and `pnpm db:migrate` against a live dev
DB works fine (TypeORM's CLI globs the migrations dir there). But every other consumer — the
server/worker/testkit `createDataSource()` runtime, and `runMigrationsForTests()` used by every
integration suite that does a fresh `dropDatabase()` + remigrate — gets its migration list from
the hand-maintained `ALL_MIGRATIONS` array in `packages/database/src/migrations/index.ts`, not a
glob (deliberate: glob behaves differently under `src` `.ts` vs `dist` `.js`/`.cjs`).

**Why:** forgetting this step passes `mise run check database` (that package doesn't run
integration tests against a fresh schema) and even `pnpm db:migrate` against your already-primed
local dev DB, but every `apps/*` integration suite fails with `column "..." does not exist` —
confusing because the migration clearly "ran" moments ago.

**How to apply:** any new migration file needs a matching `import` + array entry in
`packages/database/src/migrations/index.ts`, then `pnpm --filter @patches/database build`
(dist is what `apps/server`/`apps/worker` actually import) before integration tests will see the
new column. Same file/pattern as [[proto-nest-index-hand-maintained-reexports]] — this repo has
more than one "generator output isn't enough, the re-export list is hand-maintained" seam.
