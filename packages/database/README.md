# @patches/database

TypeORM 1.x `DataSource`, snake_case naming strategy, entities, and migrations for
Patches. Data Mapper / repository style — entities are persistence only, business logic
lives in NestJS services (`INITIAL_VISION.md` §16, ADR `docs/decisions/0003-typeorm-postgres.md`).

## Build tooling decision: tsup, not a `tsc` dual build

This package builds with **tsup** (esbuild), same as every other `packages/*` workspace —
see `docs/agents/PACKAGE_CONVENTIONS.md`. That's option (a) from this package's task
description, not option (b) (a `tsc`-emitted dual ESM/CJS build).

The risk with esbuild is that it does **not** emit `emitDecoratorMetadata` — TypeORM can use
that (TS `design:type` reflection) to infer a `@Column()`'s SQL type from the property's TS
type when no explicit `type` is given. Losing that inference silently under esbuild would be
a nasty runtime surprise (works under `ts-node`/`tsc`, breaks in the built dist).

The fix: **every `@Column`/`@PrimaryColumn`/date-column decorator in this package specifies
an explicit `type` option.** That's the only thing `emitDecoratorMetadata` would be needed
for here — relation types come from the `() => Entity` thunk, not reflection, and this
package has no relations yet anyway. `experimentalDecorators`/`emitDecoratorMetadata` are
still set `true` in `tsconfig.json` (per `PACKAGE_CONVENTIONS.md`, and so `tsc --noEmit`
type-checks decorator usage correctly) — they're just inert for the actual esbuild-built
runtime code, by design.

`src/entities/entity-column-types.test.ts` is a guard: it reads TypeORM's
`getMetadataArgsStorage()` for every entity in `ALL_ENTITIES` and fails if any column is
missing an explicit `type`. Keep it passing — it's the thing standing between "esbuild
build breaks at runtime" and "esbuild build was always going to be fine."

Chose (a) over (b) because: one build tool across every `packages/*` workspace (no special
case for the server/worker to understand), no dual-tsconfig/dist-layout complexity, and the
actual constraint (explicit column types) is cheap, static-analyzable, and arguably good
practice regardless (self-documenting schema types at the entity definition site).

## Migrations: explicit array, not a glob

`src/migrations/index.ts` exports `ALL_MIGRATIONS` as an explicit, ordered array of
imported migration classes — not `[__dirname + "/migrations/*{.ts,.js}"]`. A glob resolves
differently under `src` (TS, via the CLI's loader) vs `dist` (built `.js`/`.cjs`), which is
exactly the kind of environment-dependent behavior worth avoiding. The explicit array is
compiled import-for-import into both `dist/index.js` (ESM) and `dist/index.cjs` (CJS), so
it's correct in every context with no runtime path detection. `entities/index.ts` (
`ALL_ENTITIES`) follows the same pattern for the same reason.

## TypeORM CLI

The CLI ships two "TS-aware" launchers, `typeorm-ts-node-commonjs` / `typeorm-ts-node-esm`,
but both require `ts-node` to be installed, and this repo doesn't otherwise use `ts-node`
(it standardizes on `tsx`; see `mise.toml`/root `package.json`). Instead:

```json
"typeorm": "tsx ./node_modules/typeorm/cli.js"
```

`tsx` registers a loader for the whole process, including files the CLI itself dynamically
`import()`s (like `-d src/cli/data-source.ts`), so this works for every subcommand without
a `ts-node` dependency. Verified against a real Postgres database — see
`docs/operations/database.md` for the exact commands.

`src/cli/data-source.ts` is the CLI's DataSource: it reads `DATABASE_URL` from the
environment, first loading the repo-root `.env` (if present, via `@patches/config`'s
`readDotEnvFile`) without overriding anything already set. It refuses to run (clear error,
not a TypeORM stack trace) if `DATABASE_URL` ends up unset.

`migration:generate`/`migration:create` wrap the native `<path>`-positional-argument CLI
commands with a `--name=Foo` flag (`scripts/migration-name-command.mjs`) so
`pnpm db:generate --name=Foo` writes `src/migrations/<timestamp>-Foo.ts` — see
`docs/operations/database.md`.

**Generated migrations are a draft, not an approved change** — review the SQL before
committing, per `INITIAL_VISION.md` §16.2.
