# Atlas and Reshape — evaluated for Patches (complement, not replacement, for TypeORM migrations)

Verified 2026-08-25/26 against ariga/atlas official docs (atlasgo.io), the `ariga/atlas`
GitHub repository (source + LICENSE, via `git`/`curl`, not training data), a locally
installed Atlas community-edition binary run against the repo's real local compose
Postgres, the `fabianlindfors/reshape` GitHub repository (README + GitHub API metadata),
and PostgreSQL 17 official docs for lock levels. Full source list and exact commands run
are at the bottom.

Stack context: `packages/database` uses **TypeORM 1.1.0** (see
`docs/research/typeorm-postgres.md`). Migrations are hand-reviewed `.ts` classes generated
by `pnpm db:generate --name=<Name>` and applied by `pnpm db:migrate`
(`packages/database/src/migrations/*.ts`, wired through `ALL_MIGRATIONS`). `synchronize:
false` is hard-coded and is a hard-rule prohibition (`CLAUDE.md`, spec) — nothing below
proposes changing that, and neither tool requires it changed.

## 1. What Atlas actually is (verified)

- Apache-2.0 licensed core CLI/engine. Confirmed by fetching
  `raw.githubusercontent.com/ariga/atlas/master/LICENSE` directly — first line "Apache
  License", version 2.0.
- Two workflows, per [atlasgo.io/docs](https://atlasgo.io):
  - **Declarative**: `atlas schema inspect` / `atlas schema diff` / `atlas schema apply`
    compare a live database's actual schema against a desired-state file (HCL, SQL, or an
    ORM loader) and plan/apply the difference, Terraform-style.
  - **Versioned**: `atlas migrate diff` / `atlas migrate lint` / `atlas migrate apply`
    operate on a directory of timestamped `.sql` migration files plus an `atlas.sum`
    checksum file that Atlas owns and updates (`atlas migrate hash` recomputes it after a
    manual edit) — see
    [atlasgo.io/versioned/apply](https://atlasgo.io/versioned/apply) and
    [atlasgo.io/cli-reference](https://atlasgo.io/cli-reference).
- **Migration linting** (`atlas migrate lint`) runs entirely locally against a scratch
  "dev database" (any empty Postgres) — no cloud account needed. Analyzers include
  `destructive` (data-loss detection, e.g. `DROP COLUMN`), `data_depend` (data-dependent
  changes, e.g. adding a unique constraint where duplicates may exist), `incompatible`
  (backward-incompatible renames/drops), a `concurrent_index` analyzer specifically for
  Postgres that flags non-`CONCURRENTLY` index creation/drop on a live table, naming and
  custom statement-allow/deny rules. Source:
  [atlasgo.io/lint/analyzers](https://atlasgo.io/lint/analyzers).
- **Pre-apply drift detection** (`atlas migrate apply` refusing to run if the target DB's
  actual state doesn't match the expected state for its last-applied revision) is an
  **Atlas Pro feature** — the docs state plainly: "Pre-apply drift detection is available
  to Atlas Pro users. You can create a trial account using the `atlas login` command."
  Source: [atlasgo.io/versioned/drift-detection](https://atlasgo.io/versioned/drift-detection).
  Continuous drift **monitoring/alerting** is a separate paid product, "Atlas Schema
  Monitoring", $39/month per monitored database at time of writing
  ([atlasgo.io pricing page](https://atlasgo.io/pricing), fetched 2026-08-26 — pricing
  pages change; re-verify before budgeting).
- **Ad-hoc drift detection is free and local**, just not automatic: `atlas schema inspect`
  against a live database is a plain CLI command (verified by running it, §4 below), and
  comparing that output to a previously-saved "known good" snapshot (e.g. one taken right
  after the last migration ran) is exactly what the declarative workflow's `schema diff`
  does. This — not the paid drift-detection product — is the piece that can complement
  TypeORM here: a CI or scheduled job that runs `atlas schema inspect` against the real
  database and diffs it against a checked-in expected schema is free, requires no Atlas
  account, and would catch out-of-band changes (a manual `ALTER TABLE` someone ran by
  hand, a Neon console edit, a hotfix that bypassed `pnpm db:migrate`).
- **Import from other tools**: `atlas migrate import --from "file://migrations?format=X"
--to "file://atlas-migrations"` supports `golang-migrate`, `goose`, `flyway`,
  `liquibase`, `dbmate` — plain-SQL migration tools. **TypeORM is not in this list**, and
  for a structural reason, not just an oversight (see §3).

## 2. What Reshape actually is (verified)

- `fabianlindfors/reshape` on GitHub. **Not archived, not abandoned**: GitHub API metadata
  fetched 2026-08-26 shows `archived: false`, latest push 2026-08-04, latest release
  `v0.9.3` published 2026-08-04, 1,850 stars, 7 open issues. (This corrects an assumption
  worth flagging explicitly: this project has a history of "declared dead, actually still
  shipping" tools, so the archived-status check was run, not assumed either way.)
- MIT licensed. Postgres-only, targets Postgres 12+.
- Mechanism: migrations are TOML/JSON files in a `migrations/` directory. Reshape's
  "expand" phase creates Postgres **views** over the real tables plus triggers that
  translate reads/writes between the old and new shape, so old and new application code
  can run against the same underlying tables simultaneously during a rollout. "Complete"
  drops the compatibility views/triggers and old columns once every instance is on the new
  code.
- **This is the single biggest reason it does not fit here as a general tool**: Reshape
  owns the actual DDL execution and the compatibility-view layer end to end. It does not
  have a "just lint/inspect, don't apply" mode the way Atlas does. Adopting Reshape means
  Reshape's CLI runs the migration, not TypeORM's — there is no partial/read-only
  integration. It is a full alternative to `pnpm db:migrate` for whichever tables it
  manages, not a complement that observes what TypeORM already does.
- Reshape's compatibility views also interact with things this codebase already does
  itself: TypeORM's repositories query real table names directly, so a Reshape migration
  in progress (views substituted for tables) would require the application to query through
  Reshape's views instead of the tables TypeORM's entities/repositories are wired to — a
  nontrivial impedance mismatch that would need custom repository wiring for the affected
  tables during any migration window, not just install-and-go.

## 3. Can either genuinely complement TypeORM here? (verified + inferred)

**Atlas, in a narrow role, yes — but not via its versioned-migration ownership model.**
TypeORM's migrations are TypeScript classes (`queryRunner.query('<SQL>')` calls inside an
`up()`/`down()` method), not plain `.sql` files. This was verified directly, not assumed:

```
$ /tmp/atlas-bin migrate status \
    --dir "file://packages/database/src/migrations" \
    --url "postgres://patches:patches@127.0.0.1:5432/atlas_dev?sslmode=disable"
Migration Status: OK
  -- Current Version: No migration applied yet
  -- Next Version:    Already at latest version
  -- Executed Files:  0
  -- Pending Files:   0

$ /tmp/atlas-bin migrate lint \
    --dir "file://packages/database/src/migrations" \
    --dev-url "postgres://patches:patches@127.0.0.1:5432/atlas_dev?sslmode=disable" \
    --latest 5
(no output, exit 0)
```

Atlas's directory reader found **zero** files in `packages/database/src/migrations/`
(38 real `.ts` migration files present) because it only recognizes its own
timestamp-prefixed `.sql` naming convention plus an `atlas.sum` file it manages — it does
not parse arbitrary `.ts`/JS migration classes. `atlas migrate lint`/`atlas migrate apply`
therefore **cannot point at this repo's migrations directory as-is**. The only way to get
there is `atlas migrate import` extracting each migration's SQL into a parallel Atlas-owned
directory — a one-way conversion (comments not directly preceding a statement are dropped,
rollback/`down()` methods are not imported per Atlas's own docs) that would fork the two
tools' views of migration history rather than unify them. That is not "coexistence", it is
adopting Atlas's versioned workflow _instead of_ TypeORM's for `packages/database`, which
is out of scope per this task's constraints (no ORM swap, TypeORM 1.x stays canonical).

What **does** work today, verified by running it, is `atlas schema inspect` against a live
database with zero coupling to how the schema got there:

```
$ /tmp/atlas-bin schema inspect \
    -u "postgres://patches:patches@127.0.0.1:5432/patches?sslmode=disable"
table "account_deletion_requests" {
  schema = schema.public
  column "actor_id" { null = false; type = uuid }
  ...
  foreign_key "fk_account_deletion_requests_actor_id" {
    columns = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update = NO_ACTION
    on_delete = CASCADE
  }
}
```

(Community-edition binary prints a one-time notice that views/triggers/stored procedures
and some paid-tier features aren't supported — none of that affects plain table/index/FK
inspection, which is all a drift check needs.)

**Inferred proposal** (not implemented — see §5 for the task this implies): a scheduled or
post-deploy CI step that runs `atlas schema inspect` against the real database and diffs
the HCL output against a checked-in snapshot regenerated every time a migration lands,
failing the build on unexpected drift. This is read-only with respect to TypeORM — Atlas
never writes DDL in this role, `pnpm db:migrate` remains the only thing that applies
schema changes, and `synchronize: false` is untouched. `atlas migrate lint`'s standalone
analyzers (`destructive`, `data_depend`, `concurrent_index`) could similarly run against a
_hand-extracted_ copy of a new migration's raw SQL as an optional pre-merge sanity check,
but this needs a small script to pull the SQL out of the `.ts` file first — there is no
verified zero-glue path today.

**Reshape: no complementary role identified.** Every mechanism Reshape offers
(expand-contract via views/triggers, its own migration format, its own apply command)
requires it to own the DDL execution for the tables it touches. Point-in-time use as "just
a linter" isn't a documented mode, and nothing in its README or CLI reference suggests one.

## 4. Verification method (what was actually run, vs read)

- **Ran locally**: downloaded the Atlas community binary directly from
  `https://release.ariga.io/atlas/atlas-community-linux-amd64-latest` (the official
  install script `curl -sSf https://atlasgo.sh | sh` targets `/usr/local/bin`, which needed
  root; the binary was fetched manually instead to avoid a system-wide install) —
  `atlas community version v1.3.1-9a6bc60-canary`. Ran `atlas schema inspect`,
  `atlas migrate status`, and `atlas migrate lint` against the repo's real
  `infra/compose/docker-compose.yml` Postgres (`mise run compose -- up -d postgres`), after
  applying every real TypeORM migration in this repo (`pnpm db:migrate` — reported "No
  migrations are pending", i.e. ran against the actual, fully-migrated schema, not a toy
  one). A scratch `atlas_dev` database was created/dropped on the same local Postgres
  instance for `--dev-url` (Atlas requires an empty database to replay migrations into for
  `migrate lint`); no production or Neon database was touched anywhere in this research.
- **Read (official source, not run)**: TypeORM 1.1.0's own compiled CLI source,
  `node_modules/typeorm/migration/MigrationExecutor.js` and
  `node_modules/typeorm/commands/MigrationRunCommand.js`, as installed in this repo's
  `pnpm`-managed `node_modules` — i.e. the actual shipped package, per the research
  priority order's "official source repository" tier. Relevant for the online-DDL section
  below (§`docs/operations/database.md`), not Atlas/Reshape directly.
- **Not run**: Atlas Pro/Cloud features (drift-detection monitoring, `atlas login`) — no
  account, and out of scope since the recommendation below is not to pay for them. Reshape
  was not installed/run — its all-or-nothing DDL-ownership model was disqualifying before
  reaching an installation step; if a future task revisits it for a _specific_ hard
  migration, install and test it then rather than trusting this note's read of the README.

## 5. Recommendation

- **Atlas: adopt-partially.** Add `atlas schema inspect` as a free, local, read-only
  drift check (CI job or scheduled job comparing live schema to a checked-in snapshot),
  and optionally `atlas migrate lint`'s analyzers against hand-extracted SQL from new
  migrations as an extra pre-merge check. Do **not** adopt Atlas's versioned-migration
  workflow (`atlas migrate apply`) as a replacement or parallel applier — TypeORM's
  `pnpm db:migrate` stays the only thing that runs DDL, per this task's constraints and
  because Atlas cannot natively read this repo's `.ts` migrations anyway. Do **not** pay
  for Atlas Pro/Cloud drift monitoring — the free local `schema inspect` diff covers the
  same need for a single-node-per-deployment project without a subscription.
  **Trigger to revisit**: the project runs multiple operators/nodes with independently
  writable databases (federation §-adjacent multi-tenant deployments) where a _continuous,
  alerting_ drift signal has real value beyond a CI check — that's when the $39/mo product
  might earn its cost, not before.
- **Reshape: do-not-adopt.** Its value proposition (near-zero read/write disruption via
  views+triggers during a schema change) is real, but it demands owning migration
  execution outright, which conflicts with keeping TypeORM canonical and would require
  bespoke repository wiring during every migration window. The project itself is healthy
  (not a "why adopt an abandoned tool" problem) — this is a fit problem, not a
  maintenance-risk problem. **Trigger to revisit**: a specific migration is identified
  where the online-DDL discipline in `docs/operations/database.md` (expand-contract via
  plain SQL, `CREATE INDEX CONCURRENTLY`, `NOT VALID`/`VALIDATE CONSTRAINT`) is
  insufficient — e.g. an unavoidable full-table rewrite on the largest table with no
  acceptable lock/downtime window even with the manual expand-contract sequence — at which
  point evaluate Reshape (or a hand-rolled view/trigger shim) for that one migration only,
  not as a standing tool.

## Sources

- <https://atlasgo.io/docs>, <https://atlasgo.io/versioned/apply>,
  <https://atlasgo.io/versioned/import>, <https://atlasgo.io/versioned/drift-detection>,
  <https://atlasgo.io/lint/analyzers>, <https://atlasgo.io/cli-reference>,
  <https://atlasgo.io/pricing> (fetched 2026-08-26)
- <https://raw.githubusercontent.com/ariga/atlas/master/LICENSE> (fetched 2026-08-26)
- Atlas community binary `v1.3.1-9a6bc60-canary`, run locally 2026-08-26 against
  `infra/compose/docker-compose.yml` Postgres
- <https://github.com/fabianlindfors/reshape> (README) and
  `api.github.com/repos/fabianlindfors/reshape` +
  `api.github.com/repos/fabianlindfors/reshape/releases/latest` (fetched 2026-08-26)
- `node_modules/typeorm@1.1.0`'s own compiled `migration/MigrationExecutor.js` and
  `commands/MigrationRunCommand.js`, as installed in this repo (pnpm-resolved package)

## Discrepancies / follow-up

- No spec/ADR discrepancy — this note does not propose anything that touches
  `synchronize`, ORM choice, or migration ownership.
- **Suggested follow-up tasks** (filed in `tasks.md`, not implemented here — see below):
  a CI/scheduled job wiring `atlas schema inspect` as a drift check, and a small script to
  extract raw SQL from a TypeORM migration's `up()` for optional `atlas migrate lint`
  analyzer use. Neither needs an ADR — both are additive, read-only tooling that doesn't
  change how migrations are authored or applied.
