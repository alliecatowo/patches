# Continuous integration

Describes the GitHub Actions setup in `.github/workflows/` per `INITIAL_VISION.md` §120
(required PR checks) and §121 (dependency security). As of 2026-08-17 the project is in
Phase 0; this CI configuration is new and has not yet observed a real run — see
"Assumptions to reconcile" below for the spots most likely to need a follow-up fix once
other in-flight packages (`proto`, `database`, `server`, `tui`, `terminal-media`) land
their own scripts.

## Workflows

- **`.github/workflows/ci.yml`** — runs on every pull request and on push to `main`.
  Required for branch protection (see below).
- **`.github/workflows/deploy.yml`** — `workflow_dispatch`-only placeholder for Phase 7.
  See `docs/operations/deployment.md`.
- **`.github/actions/setup/action.yml`** — the composite action every CI job (except
  `actionlint`) uses to install the toolchain and dependencies. It does **not** check
  out the repo itself: a local composite action (`uses: ./...`) can only be resolved
  once the repo is already on disk, so every job that uses it runs `actions/checkout@v4`
  as its own first step, before `uses: ./.github/actions/setup`.

## What each `ci.yml` job does

| Job           | What it runs                                                                                                                                        | Notes                                                                                                                                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`     | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`                                                                                                  | `typecheck` is a Turbo task that depends on `^build` + `gen`, so it pulls in generated protobuf code automatically.                                                                                                                                                                                   |
| `proto`       | `pnpm proto:format`, `pnpm proto:lint`, `pnpm proto:breaking` (PRs only), `pnpm proto:gen` + `git diff --exit-code -- packages/proto/src/generated` | Proves buf-generated TypeScript is committed and up to date. Checks out full history (`fetch-depth: 0`) and fetches `main` explicitly so `buf breaking --against '.git#branch=main,subdir=packages/proto'` has something to diff against. Skipped on push to `main` itself (no meaningful self-diff). |
| `build-test`  | `pnpm build`, `pnpm test`                                                                                                                           | Unit tests only (vitest, no external services). Uploads any `**/coverage/**` output as an artifact — best-effort, does not fail if a project has no coverage provider configured.                                                                                                                     |
| `integration` | `pnpm build`, migration validation, `pnpm test:integration`                                                                                         | See "Migration validation" and "Why one database" below. Runs against a `postgres:17-alpine` service container.                                                                                                                                                                                       |
| `actionlint`  | `actionlint .github/workflows/*.yml`                                                                                                                | Lightweight job — just checkout + mise (actionlint only), no workspace install.                                                                                                                                                                                                                       |
| `ci-ok`       | Aggregates the result of every job above                                                                                                            | The single required status check for branch protection (see below). Uses `if: always()` so it still runs and reports failure even if an earlier job failed, was cancelled, or was skipped.                                                                                                            |

### Migration validation

`INITIAL_VISION.md` §120 requires a "migration validation" check. The `integration` job
does, in order:

1. `pnpm build`
2. `pnpm db:migrate` — apply all migrations.
3. `pnpm db:show` — informational; logged for humans reading the run, not parsed.
4. `pnpm db:migrate` **again** — this is the actual assertion. TypeORM 1.x's
   `migration:run` exits `0` and logs that nothing is pending when there's nothing left
   to apply, rather than erroring, so a second consecutive successful run proves zero
   migrations are pending without depending on `db:show`'s exact output string (which
   `packages/database` hadn't defined yet at the time this workflow was written —
   **reconcile this assertion once that script exists**, e.g. by grepping `db:show`'s
   output for a real "0 pending" marker if one turns out to be easy to match).
5. `pnpm db:revert` — proves the down migration works.
6. `pnpm db:migrate` — proves the up migration works again.

Before any of that, a "Create per-project test databases" step provisions
`patches_test_server` and `patches_test_testkit` (the `services:` postgres container
only creates `POSTGRES_DB`, i.e. `patches_test`, on boot) — see "Why one database"
below.

7. `pnpm test:integration`.

### Why one database

`DATABASE_URL` and `TEST_DATABASE_URL` both point at the same `patches_test` database
(created by the `services:` postgres container's `POSTGRES_DB`). Migration validation
(which reads `DATABASE_URL`) runs to completion before `test:integration` (which reads
`TEST_DATABASE_URL`) starts, so by the time tests connect the schema is already
migrated. Sharing a database between migration validation and the integration suite is
fine — nothing requires them to be isolated from each other.

The `database` and `testkit` vitest projects, however, _do_ need to be isolated from
each other: both call `dropDatabase()` against `TEST_DATABASE_URL` (`database` directly;
`testkit` via `createTestDataSource()`), and running them concurrently against the same
database races one project's drop against the other's in-progress test (tasks.md A-006).
Two things fix this without touching `packages/database`/`packages/testkit` (owned by
other in-flight work at the time this was written):

- `test:integration` runs with `--no-file-parallelism`, so `database` and `testkit`
  never execute test files at the same time regardless of which database they point at.
- `server-integration` (`apps/server`) gets its own database, `patches_test_server`, via
  `TEST_DATABASE_URL_SERVER` (falls back to `TEST_DATABASE_URL` with the database name
  swapped — see `apps/server/vitest.integration.config.mts`). No test exercises this yet
  (Phase 1 lands server-side persistence), but it means a future DB-backed server
  integration test never has to share `patches_test` at all.

`patches_test_testkit` is also provisioned (see the "Create per-project test databases"
step and `infra/compose/postgres/init/01-test-db.sql`) for a future full per-project
split, but isn't wired up yet — `packages/testkit`'s own vitest config would need to
read a dedicated env var for that, which is out of scope for whoever doesn't own that
package. Follow-up: B-012 in tasks.md.

### Toolchain setup (composite action)

`.github/actions/setup/action.yml` (checkout happens in the calling job, not here —
see "Workflows" above):

1. `pnpm/setup@v2` installs Node 24.19.0 + pnpm (version read from this repo's
   `packageManager` field, `pnpm@11.22.0`, matching `mise.toml`).
2. `jdx/mise-action@v4` installs `buf` and `actionlint` from `mise.toml`'s pins, with
   `MISE_DISABLE_TOOLS: node,pnpm,docker-compose` so mise doesn't also try to install
   node/pnpm (redundant with step 1) or docker-compose (not needed in CI — Postgres
   runs as a native GitHub Actions `services:` container, not via compose).
3. `pnpm install --frozen-lockfile`.
4. Restores the Turborepo local cache (see "Caching" below).

**Why not install everything through `mise-action` alone?** `jdx/mise-action` can install
Node and pnpm from `mise.toml` directly, which would be one fewer action in the setup
path. This workflow uses `pnpm/setup@v2` for Node + pnpm instead, per
`docs/research/monorepo-toolchain.md` §7's guidance that `pnpm/setup@v2` is the simpler,
more current path for pnpm 11+, and because installing pnpm through mise in CI has a
reputation for flakiness in some setups. Nobody has yet observed a concrete mise-action
pnpm failure _in this repo's own CI_ (no run has happened yet) — if a future run shows
mise-action's pnpm install working fine, this split can be collapsed back to a single
`mise-action` step. Until then, treat the split as the safer default.

## Caching

- **pnpm store** — via `pnpm/setup@v2`'s `cache: true`, keyed on the lockfile
  automatically.
- **mise tool cache** — via `jdx/mise-action`'s `cache: true`.
- **Turbo local cache** — `actions/cache@v4` on `.turbo`, key `turbo-<runner.os>-<sha>`,
  restore-keys `turbo-<runner.os>-`. The key is intentionally shared across jobs (not
  namespaced per job) because Turbo hashes each task by its actual inputs — a `build`/
  `gen` result computed in one job is reusable by another job that needs the same task
  with the same inputs. Concurrent jobs racing to save the same cache key is harmless;
  `actions/cache` silently skips the save on a duplicate key rather than failing the
  step.

## Branch protection

Configure the repository's branch protection rule for `main` to require the single
`ci-ok` status check (not each individual job) — that's the aggregator job, and it fails
if any of `quality`, `proto`, `build-test`, `integration`, or `actionlint` failed, was
cancelled, or was skipped. Requiring `ci-ok` alone (rather than listing every job) means
adding a new job to `ci.yml` later doesn't require updating the branch protection rule
too, as long as the new job is added to `ci-ok`'s `needs:` list.

## Reproducing CI locally

```bash
# quality
pnpm verify              # format:check + lint + typecheck + test, in one command
                          # (`pnpm test` builds every workspace package first via
                          # turbo, so this also works right after a fresh clone —
                          # tests resolve @patches/* packages via their built dist/)

# proto
pnpm proto:format
pnpm proto:lint
pnpm proto:breaking -- --against '.git#branch=main,subdir=packages/proto'
pnpm proto:gen && git diff --exit-code -- packages/proto/src/generated

# integration (needs Postgres)
mise run compose -- up -d   # also creates patches_test_server/patches_test_testkit,
                             # see infra/compose/postgres/init/01-test-db.sql
pnpm db:migrate
pnpm test:integration       # runs database + testkit + server-integration serially
                             # (--no-file-parallelism) — see "Why one database" above

# actionlint
mise exec -- actionlint .github/workflows/*.yml
```

## Dependabot

`.github/dependabot.yml` configures weekly, grouped updates for the `npm` (pnpm
lockfile) and `github-actions` ecosystems. See the caveat comment in that file about
pnpm 11's multi-document lockfile and `catalog:` entries occasionally tripping up
Dependabot's parser upstream — review pnpm lockfile PRs from Dependabot by hand rather
than auto-merging them. Major-version updates to `typescript` are excluded (ADR 0009
pins the 5.9.x line).

## Notes on script wiring

- `pnpm proto:breaking` runs `packages/proto/scripts/breaking.sh`, which resolves the diff
  target itself (`main`, falling back to `origin/main`) and skips with a message when the
  base branch has no protobuf module yet (the first proto commit) or the ref isn't fetched.
- Migration validation asserts "0 pending" by running `pnpm db:migrate` twice (the second
  run must succeed with nothing to apply); `pnpm db:show` prints `[X]`/`[ ]` per migration
  and is shown for human readability.
- Every root script referenced here (`format:check`, `lint`, `typecheck`, `build`, `test`,
  `test:integration`, `proto:*`, `db:*`) has been run locally against the wired repo
  (2026-08-17); the workflow itself is exercised on the first PR.
- `pnpm test` runs `turbo run build && vitest run` rather than plain `vitest run`
  (tasks.md A-015): without the build, `vitest` resolves `@patches/*` workspace imports
  against packages that have never been compiled on a fresh clone, so the very first
  `pnpm test` after `git clone` used to fail. Turbo caches the build, so repeat runs
  stay cheap.
- `ci.yml`'s `concurrency.cancel-in-progress` is scoped to `github.event_name ==
'pull_request'` — a push to `main` always runs to completion rather than being
  cancelled by whatever pushes next, since `main` needs a completed status check on
  every commit.
