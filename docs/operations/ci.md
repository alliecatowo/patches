# Continuous integration

Describes the GitHub Actions setup in `.github/workflows/` per `INITIAL_VISION.md` §120
(required PR checks) and §121 (dependency security). **Status: implemented and
actionlint-clean.** The protobuf-format and platform-sensitive TUI portability failures from
the latest `main` run have been fixed and the full local equivalent now passes. A new
successful GitHub `main` run has not yet validated this revision, and none of its downstream
publish workflows has run.

## Workflows

- **`.github/workflows/ci.yml`** — runs on every pull request and on push to `main`.
  Required for branch protection (see below).
- **`.github/workflows/deploy.yml`** (added 2026-08-25, B-145 companion work) — deploys
  Fly after a successful push-triggered CI run for this repository's `main`, guarded by
  the production environment and both `FLY_DEPLOY_ENABLED` and
  `AUTH_CODE_ENVELOPE_ROLLOUT_COMPLETE`. The first gate is the operator's explicit switch
  for routine Fly deployment; the second confirms the one-time auth-code-envelope
  rollout is complete. Both must be `true` for deploy and healthz-verify steps; either
  being unset or false leaves the workflow as a safe no-op. **This is not yet the only
  thing deploying `patches-social`** — see `docs/operations/deployment.md`'s "Deploy
  paths" section for the still-connected, ungated Fly GitHub App that races it.
- **`.github/workflows/{web,site,site-gh-pages}.yml`** — build/publish the production web
  and site artifacts only after a successful push-triggered CI run for this repository's
  `main`; Cloudflare publishing remains separately variable-gated.
- **`.github/actions/setup/action.yml`** — the composite action every CI job (except
  `actionlint`) uses to install the toolchain and dependencies. It does **not** check
  out the repo itself: a local composite action (`uses: ./...`) can only be resolved
  once the repo is already on disk, so every job that uses it runs `actions/checkout@v7`
  as its own first step, before `uses: ./.github/actions/setup`.

## What each `ci.yml` job does

| Job           | What it runs                                                                                                                                        | Notes                                                                                                                                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`     | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`                                                                                                  | `typecheck` is a Turbo task that depends on `^build` + `gen`, so it pulls in generated protobuf code automatically.                                                                                                                                                                                   |
| `proto`       | `pnpm proto:format`, `pnpm proto:lint`, `pnpm proto:breaking` (PRs only), `pnpm proto:gen` + `git diff --exit-code -- packages/proto/src/generated` | Proves buf-generated TypeScript is committed and up to date. Checks out full history (`fetch-depth: 0`) and fetches `main` explicitly so `buf breaking --against '.git#branch=main,subdir=packages/proto'` has something to diff against. Skipped on push to `main` itself (no meaningful self-diff). |
| `build-test`  | `pnpm build`, `pnpm test`                                                                                                                           | Unit tests only (vitest, no external services). Uploads any `**/coverage/**` output as an artifact — best-effort, does not fail if a project has no coverage provider configured.                                                                                                                     |
| `integration` | `pnpm build`, migration validation, `pnpm test:integration`                                                                                         | `needs: build-test` (added 2026-08-25) — shares its turbo cache scope with `build-test` instead of racing it (see "Caching" below). See "Migration validation" and "Why one database" below. Runs against a `postgres:17-alpine` service container.                                                   |
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
`patches_test_server`, `patches_test_worker`, `patches_test_admin`, and
`patches_testkit_test` (the `services:` postgres container only creates
`POSTGRES_DB`, i.e. `patches_test`, on boot) — see "Why one database" below.

7. `pnpm test:integration`.

### Why one database

`DATABASE_URL` and `TEST_DATABASE_URL` both point at the same `patches_test` database
(created by the `services:` postgres container's `POSTGRES_DB`). Migration validation
(which reads `DATABASE_URL`) runs to completion before `test:integration` (which reads
`TEST_DATABASE_URL`) starts, so by the time tests connect the schema is already
migrated. Sharing a database between migration validation and the integration suite is
fine — nothing requires them to be isolated from each other.

The `database`, `server-integration`, `worker-integration`, `admin-integration`, and
`testkit` vitest projects each get their **own** database now (B-012 closed out the
last gap — `testkit` used to share `patches_test` with `database`, see "History"
below).

Root `pnpm test:integration` (`package.json`) selects these with
`--project database --project testkit --project '*-integration'` — the `*-integration`
glob (vitest supports wildcard `--project` filters) picks up any future
`<workspace>-integration` project automatically, so adding one only means naming its
vitest project that way, not also editing this script (H-022). `database` and `testkit`
stay listed by their literal names since they're single hybrid unit+integration
projects (see their own `vitest.config.ts` doc comments) rather than following the
`-integration` suffix convention.

Today that resolves to:

- `database` uses `patches_test` (`TEST_DATABASE_URL`, the one the `services:` postgres
  container provisions on boot).
- `server-integration` uses `patches_test_server` via `TEST_DATABASE_URL_SERVER` (falls
  back to `TEST_DATABASE_URL` with the database name swapped — see
  `apps/server/vitest.integration.config.mts`).
- `worker-integration` uses `patches_test_worker` via `TEST_DATABASE_URL_WORKER`, same
  pattern (`apps/worker/vitest.integration.config.mts`).
- `admin-integration` uses `patches_test_admin` via `TEST_DATABASE_URL_ADMIN`, same
  pattern (`apps/admin/vitest.integration.config.mts`) — the admin CLI's own
  integration suite exercises its command handlers against a real database.
- `testkit` uses `patches_testkit_test` via `TEST_DATABASE_URL_TESTKIT`, same pattern
  again (`packages/testkit/vitest.config.ts`). Named with a `_test` **suffix**, not
  `patches_test_testkit`'s infix — `createTestDataSource()`'s own guard (the thing this
  project's suite is actually testing) requires the database name to _end_ in `_test`
  (`INITIAL_VISION.md` §119), and it would be circular for `testkit`'s tests to work
  around their own package's safety check instead of satisfying it.

All five databases are provisioned by the "Create per-project test databases" step (CI)
or `infra/compose/postgres/init/01-test-db.sql` (local `mise run compose -- up -d`).

`test:integration` still runs with `--no-file-parallelism` even though no project shares
a database with another anymore. This was tested and kept deliberately: running all five
projects' test files fully in parallel (no `--no-file-parallelism`) reproducibly fails
several `server-integration` specs (`feeds.integration.test.ts`,
`posts.integration.test.ts`) that pass reliably with it — most likely resource
contention (concurrent real Nest microservice boots + Postgres connections under full
parallel load) rather than a database-sharing race, but the fix for a flaky-under-load
suite is the same either way: don't run it under full load. Revisit if `test:integration`
becomes a bottleneck worth the investigation.

### History

`testkit` used to share `patches_test` with `database` (both call `dropDatabase()`,
`database` directly and `testkit` via `createTestDataSource()`), which is exactly the
class of race `--no-file-parallelism` existed to prevent (tasks.md A-006). Fixed by
B-012 giving `testkit` its own database once someone owned `packages/testkit`'s vitest
config — see the git history of this file for the pre-B-012 version of this section.

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
- **Turbo local cache** — `actions/cache@v4` on `.turbo`, key
  `turbo-<runner.os>-<scope>-<sha>`, restore-keys `turbo-<runner.os>-<scope>-`, where
  `<scope>` defaults to the calling job's own name (`.github/actions/setup`'s
  `cache-scope` input). **Changed 2026-08-25** (B-145 companion CI cleanup): earlier
  this key was shared across every job unscoped
  (`turbo-<runner.os>-<sha>`) on the theory that a same-commit `build`/`gen` result
  computed in one job is reusable by any other job needing the same inputs. That's
  true of the cache _contents_, but not of `actions/cache`'s save semantics: every job
  in a run restores near-simultaneously (before any of them has saved yet), and
  `actions/cache` silently skips a save once a cache already exists under that exact
  key — so in practice only the FIRST job to finish successfully persisted its `.turbo`
  output per commit, and every other job's freshly-computed cache entries were
  dropped. Scoping the key by job name means every job persists its own cache on
  every run. The `integration` job is the one deliberate exception: it passes
  `cache-scope: build-test` and is sequenced `needs: build-test` (see the job table
  above), since both jobs run the literal same full-workspace `pnpm build` — this
  guarantees `integration` restores a cache `build-test` has _already_ saved, instead
  of computing (and then dropping) its own redundant one.

## Branch protection

Configure the repository's branch protection rule for `main` to require the single
`ci-ok` status check (not each individual job) — that's the aggregator job, and it fails
if any of `quality`, `proto`, `build-test`, `integration`, or `actionlint` failed, was
cancelled, or was skipped. Requiring `ci-ok` alone (rather than listing every job) means
adding a new job to `ci.yml` later doesn't require updating the branch protection rule
too, as long as the new job is added to `ci-ok`'s `needs:` list.

The Fly deploy also requires the one-time encrypted-auth-envelope rollout to have completed:
`AUTH_CODE_ENVELOPE_ROLLOUT_COMPLETE=true` is deliberately separate from the routine
`FLY_DEPLOY_ENABLED=true` switch. The migration and envelope-aware server/worker code pass
locally, but the quiesced live rollout has not run, so the completion variable must remain
unset/false and the workflow must remain a no-op. Cloudflare publish workflows are likewise
implemented but have not published this revision.

### Merging: `mise run merge-pr`

`main`'s `protect-main` ruleset requires `ci-ok` **and** grants the `admin` repository
role `bypass_mode: always`. That bypass is deliberate — a required check that can never
report (a stalled Actions queue, a run that is created but never dispatched) would
otherwise leave `main` unmergeable with no way out. The cost is that an admin merging
through `gh pr merge` is never told the gate was skipped.

`mise run merge-pr -- <pr-number>` closes that gap locally. It reads the PR's
`statusCheckRollup`, and refuses unless a check named `ci-ok` has `COMPLETED` with
`SUCCESS`, naming what it actually saw (no checks at all, still running, or a non-success
conclusion). To use the bypass you have to ask for it by name:

```sh
mise run merge-pr -- 125                                    # merges only if ci-ok is green
mise run merge-pr -- 125 --bypass "Actions queue stalled"   # merges anyway, loudly
```

A bypass prints a banner and records the reason in the merge commit body, so the decision
is visible afterwards rather than indistinguishable from a normal merge. `--bypass` with
no reason is rejected. The script is `infra/scripts/merge-pr.mjs`; it shells out to `gh`,
so it inherits whatever `gh` is authenticated as.

Note that a _stale_ required check is not the same as a missing one: GitHub has been
observed leaving runs `queued` for tens of minutes and surfacing them as `completed` to
the cancel endpoint while `gh run list` still shows them queued. Those zombies cannot be
deleted (`DELETE /actions/runs/:id` returns 403) and simply age out; they do not block
newly dispatched runs.

### `workflow_run` deploys run _main's_ workflow against an _older_ checkout

`web.yml`, `site.yml` and `deploy.yml` all trigger on `workflow_run` after CI completes,
and check out `ref: ${{ github.event.workflow_run.head_sha }}`. GitHub always uses the
workflow **definition** from the default branch, so a run can execute a step that main has
but the checked-out commit does not.

Seen 2026-08-26: the `dist:check` step B-201 added to `web.yml` fired against a replayed
run for a commit that predated the `dist:check` script, and failed with
`[ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT] None of the selected packages has a "dist:check"
script`. It is self-limiting — every commit from B-201 onward has the script — but it bites
any time a backlogged or manually re-run deploy targets an older sha. If you add a workflow
step that invokes a **new** package script, expect replayed runs for older commits to fail
until they age out, and don't mistake it for a broken gate. `workflow_dispatch` against
`main` is the clean way to force a deploy of current `main` when this happens.

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
mise run compose -- up -d   # also creates patches_test_server/patches_test_worker/
                             # patches_test_admin/patches_testkit_test, see
                             # infra/compose/postgres/init/01-test-db.sql
pnpm db:migrate
pnpm test:integration       # runs database + testkit + server-integration +
                             # worker-integration + admin-integration serially
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

## Local pre-push vs CI (B-178/B-127)

The lefthook `pre-push` hook (`lefthook.yml`) does **not** run plain `pnpm verify`/`pnpm
test` — it runs a `--affected`-scoped, concurrency-bounded, `--continue=dependencies-
successful` turbo invocation instead (documented in full in
`docs/operations/local-development.md`'s "Git hooks" section). That divergence is
deliberate and scoped to the local hook only: `ci.yml`'s `build-test` job still runs the
full, unscoped `pnpm build && pnpm test` (and `quality` still runs the full
`pnpm format:check && pnpm lint && pnpm typecheck`) against every package on every PR, and
`ci-ok` remains the single required status check for `main`. Local pre-push exists to catch
problems before a push, not to replace CI as the actual gate — narrowing its scope to move
faster/more reliably on a shared dev box is safe precisely because CI's scope didn't change.
