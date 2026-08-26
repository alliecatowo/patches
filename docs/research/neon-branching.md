# Neon branching for local, dev-mirror, and production databases

Verified: **2026-08-22**, extended **2026-08-26** (Migration test harness section,
P19-012) against official Neon CLI, branching, protected-branch, GitHub Actions, API-key,
and data-anonymization documentation. The 2026-08-26 pass re-ran `neon branches --help`
and `neon branches create --help` locally (`neon` 3.6.0) to confirm `schema-diff` and
`--schema-only` still match this note's earlier description, and attempted `neon me`
(interactive OAuth) — it opened the correct auth URL and then timed out waiting for a
browser, confirming there is no pre-authenticated session available in this environment,
not that the CLI/flow is broken.

Stack state: Patches uses PostgreSQL through TypeORM, but has no Neon CLI package
or mise tool pin yet. The current official CLI package observed during research is
`neon` 3.6.0 (Node >=20.19); this is a research baseline, not a dependency added by
this note. The repo's Node 24 pin satisfies that minimum.

Everything below is documented Neon behavior unless labeled **inferred** or
**unverified**.

## Current CLI and authentication

Neon's current [install guide](https://neon.com/docs/reference/cli-install)
renamed the primary command/package to `neon`; `neonctl` remains an alias. The
docs show `npm i -g neon@latest`, `npx neon`, standalone binaries, or Homebrew's
still-named `neonctl` formula. This differs from older examples and training data
that use only `neonctl` or the `neonctl` npm package.

Interactive developers can use `neon auth`. Automation uses `NEON_API_KEY` or
the `--api-key` option. For an organization-owned project, Neon documents
[project-scoped organization API keys](https://neon.com/docs/manage/orgs-api)
as limited, member-level access to a specific project; ordinary organization
keys have admin access across the organization.

**Inferred:** use a project-scoped organization key for CI branch lifecycle
automation where the account/plan supports it, store it as the GitHub environment
secret `NEON_API_KEY`, and store `NEON_PROJECT_ID` as a non-secret GitHub variable.
Fall back to a personal key only if the project is not organization-owned or the
required branch operations are unavailable to a scoped key. Never place the key
in `mise.toml`, `.mcp.json`, `.codex/config.toml`, command arguments, or logs.

## Branch primitives

The current [`neon branches` CLI reference](https://neon.com/docs/cli/branches)
documents:

```bash
neon branches create \
  --project-id <project-id> \
  --parent <production-or-mirror-branch-id> \
  --name <unique-branch-name> \
  --expires-at <RFC3339-timestamp>

neon connection-string <branch-id-or-name> \
  --project-id <project-id> \
  --database-name <database> \
  --role-name <role>

neon branches delete <branch-id-or-name> --project-id <project-id>
```

- `--parent` accepts a branch name, ID, timestamp, or LSN and defaults to the
  project's default branch. Automation should always specify it explicitly.
- branch creation normally includes one read-write compute; `--no-compute`
  creates none. `--suspend-timeout` controls scale-to-zero behavior.
- `--expires-at` accepts RFC 3339. When the deadline is reached, Neon permanently
  deletes the branch and its compute endpoints. `branches set-expiration` can add,
  replace, or remove the deadline later.
- `connection-string` returns a URL containing the role password. It supports
  branch name/ID plus explicit database and role; `--pooled` selects the pooled
  hostname. Treat stdout as a secret and map it directly into a step-scoped
  `DATABASE_URL`, never a job summary or debug log.
- `branches reset <child> --parent` refreshes a child to the latest state of its
  parent. `--preserve-under-name` retains the old state under another branch.
- explicit `branches delete` is the normal teardown. Expiration is a second,
  independent cleanup boundary for cancelled workflows and interrupted agents.

Every branch has its own connection string and isolated writes, but Neon states
that a child includes the parent's databases, roles, schema, and data. Isolation
does **not** mean the cloned production data is non-sensitive.

## Recommended three-tier topology

**Inferred from the documented primitives:**

```text
local:  compose Postgres (disposable synthetic data)

cloud:  Neon production (protected; application traffic)
          |
          +-- controlled anonymization --> dev-mirror
                                              |
                                              +-- ephemeral task/PR branches
                                                  (expiry + explicit teardown)
```

1. Keep local compose/Postgres as the default fast path, with synthetic seed
   data and no cloud credential requirement.
2. Mark the Neon production branch protected. Neon documents that protected
   branches cannot be deleted or reset, their computes cannot be deleted, and
   child branches receive new role passwords. This feature is plan-dependent;
   see [Protected branches](https://neon.com/docs/guides/protected-branches).
3. Do not hand general development access to direct production clones. Create
   and maintain one anonymized dev-mirror from production, then make ordinary
   dev/test branches children of that mirror.
4. Give every ephemeral child a deterministic unique name, an explicit parent,
   and a short `--expires-at` deadline at creation. Record the returned branch
   ID and use the ID for connection lookup and deletion so a name collision
   cannot target the wrong branch.
5. Always attempt explicit deletion in workflow cleanup/PR-close handling;
   retain expiration as the fail-safe. Verify deletion by listing/getting the
   ID. Never make production branch IDs eligible for a generic cleanup query.

## Production data and anonymization

Neon's protected-branch feature changes child role passwords, not the copied
rows. The official docs state a child contains the parent's databases and roles.
Therefore a direct child of production still contains user data.

Neon now provides a documented
[anonymized-branch API](https://neon.com/docs/changelog/2025-11-21) with masking
rules and operations to create the branch, start anonymization, and poll status.
Neon's published workflow is production → anonymized staging/mirror → disposable
children. If masking is not available on the chosen plan, the CLI's
`--schema-only` branch plus synthetic fixtures is the safer fallback.

**Inferred safety gate:** a dev-mirror is not ready merely because the branch
exists. Automation must poll anonymization to success and run leakage checks for
all sensitive classes Patches stores (email/auth identifiers, profile data, DM
bodies, IP/moderation audit data, and any token/code material) before publishing
its connection string to developers or CI. DM bodies must remain absent from
logs throughout this flow under the project hard rules.

## GitHub Actions lifecycle

Neon's official
[branching with GitHub Actions guide](https://neon.com/docs/guides/branching-github-actions)
documents create, delete, reset, and schema-diff actions, with `NEON_API_KEY` as
a secret and `NEON_PROJECT_ID` as a variable. Current examples use
`neondatabase/create-branch-action@v6`; re-check action majors when implementing
rather than copying older `@v5` examples.

**Inferred workflow rules:**

- use a dedicated non-production GitHub environment for Neon test credentials;
  production deploy credentials should not be reachable by PR jobs
- create the branch only after ordinary CI passes, or only for explicitly
  requested integration runs, to control spend and production-data exposure
- pass the generated connection string only to migration/integration-test steps
  as `TEST_DATABASE_URL`; never overwrite the production `DATABASE_URL`
- make the cleanup job `if: always()` where event semantics permit, and also
  delete on PR close; expiration remains mandatory because cancelled workflows,
  forks, and missing secrets can prevent cleanup jobs
- do not use `pull_request_target` to check out or execute untrusted PR code with
  `NEON_API_KEY`; GitHub does not expose Actions secrets to ordinary fork PRs

## Migration test harness (P19-012): validate a migration on prod-sized data before apply

**Status of this section: design + verified CLI surface, not a running harness.** No
credentials were available in this research session (no `neon` MCP server registered in
`.mcp.json` here — only `mise` is — and `neon me`/`neon branches create` both attempted
live against `oauth2.neon.tech` and failed on authentication timeout, confirmed by
actually running them, not assumed). `docs/operations/database.md` currently states Neon
production is **Status: implemented** (moved from Fly Postgres 2026-08-18, per the
Discrepancies section below); this research could not independently confirm that from
inside this session and did not touch any live database. Treat everything below as a
verified-CLI-surface design, contingent on whoever wires CI secrets confirming the account
holds the plan tier each step needs (branch schema-only/protected/anonymized features are
plan-gated per Neon's docs, §"Production data and anonymization" above).

### Why a branch and not a copy

A Neon branch is copy-on-write against the parent's storage — creating one does not copy
gigabytes of data up front, and dropping it after the test costs nothing beyond the
lifetime it existed. This is what makes "run the real migration against prod-sized data,
then throw the branch away" cheap enough to do on every migration, not just occasionally.
Confirmed CLI primitives (branch creation semantics already documented above); the
schema-only variant and the schema-diff comparison used in the harness below were
independently re-verified for this section by running `neon branches create --help` and
`neon branches --help` locally (`neon` 3.6.0, this repo's pinned CLI, `mise.toml`'s
`"npm:neon" = "3.6.0"`):

```
$ neon branches create --help
...
--schema-only    Create a schema-only branch. Requires exactly one read-write
                 compute. [boolean] [default: false]
--protected      Whether the branch is protected. ... Paid plans only.
...

$ neon branches --help
...
neon branches schema-diff [base-branch] [compare-source[@(timestamp|lsn)]]
  Compare the latest schemas of any two branches, or compare a branch to its
  own or another branch's history. [aliases: sd]
```

### Proposed harness shape (inferred design, not yet implemented)

```text
1. create:  neon branches create --project-id <id> --parent <production-or-dev-mirror>               --name migration-test-<PR#>-<sha> --expires-at <now + 2h>
2. connect: neon connection-string migration-test-<PR#>-<sha> --project-id <id>               --database-name patches --role-name <role>   # → TEST_DATABASE_URL
3. baseline: neon branches schema-diff <parent-branch> migration-test-<PR#>-<sha>
              # expect NO diff yet — confirms the new branch really matches its parent
              # before the migration under test runs (catches a stale/wrong --parent)
4. apply:   DATABASE_URL=$TEST_DATABASE_URL pnpm db:migrate
              # time it; this is the number that matters for the go/no-go call, since a
              # migration that takes 40 minutes on prod-sized data is a different decision
              # than one that takes 4 seconds, even if both eventually succeed
5. verify:  pnpm db:show                     # reports 0 pending — the migration applied
            neon branches schema-diff <parent-branch> migration-test-<PR#>-<sha>
              # now expect exactly the diff the migration's generated SQL describes —
              # anything else means the migration did something the reviewed SQL didn't
              # account for, or the branch had already drifted from its parent
6. reversibility: DATABASE_URL=$TEST_DATABASE_URL pnpm db:revert
              # confirms the same up→down→up discipline this repo already applies locally
              # (P18-002 precedent) but against the real data shape, not a synthetic fixture
7. teardown: neon branches delete migration-test-<PR#>-<sha> --project-id <id>
              # always run this even on failure (if: always() in CI); --expires-at from
              # step 1 is the fail-safe if teardown itself doesn't run
```

Step 4's timing is the actual point of this harness relative to running the same migration
against local compose Postgres: compose Postgres has synthetic/empty data, so it cannot
reveal that (for example) a `SET NOT NULL` needing a full table scan takes half a second
against 200 local rows and twenty minutes against a production-sized `posts` table. This
harness is what makes online-DDL discipline (`docs/operations/database.md`) an informed
choice rather than a guess: run the migration for real, on a real-sized copy, throw it
away, and only then decide it's safe to apply at deploy time. `--schema-only` (no data)
would not catch this — the harness needs a **data-carrying** branch, meaning a `--parent`
that is production or an anonymized production mirror (see "Recommended three-tier
topology" above), never a synthetic-fixture branch, for the timing number to mean anything.

**Inferred, not yet decided:** whether this runs as a required PR check (adds Neon API
calls + a branch lifecycle to every migration-touching PR) or an on-demand
`/migration-bench <PR#>` style manual trigger for migrations the author flags as
higher-risk (touches a large table, adds an index, changes a type). A required check is
more thorough but adds latency/cost/attack-surface (a fork PR must never see
`NEON_API_KEY` — see "GitHub Actions lifecycle" above) to every migration, including
trivial ones; a manual trigger needs a human to correctly judge "this one needs it," which
they won't always do. This choice needs a decision, not a default — flagged as follow-up
below rather than picked here.

## Discrepancies and unverified items

- **Architecture discrepancy requiring an ADR:** `INITIAL_VISION.md` and ADR
  0003 name Fly Managed Postgres as the preferred production provider, while
  `docs/operations/deployment.md` records that the live database moved to Neon
  on 2026-08-18. PostgreSQL/TypeORM remain unchanged, but the provider decision
  has already diverged from the authoritative spec and accepted ADR. An architect
  should record the rationale and operational consequences rather than letting
  the deployment runbook silently override them.
- Older Neon material uses `neonctl`; current docs use `neon` and keep
  `neonctl` only as an alias.
- Older Neon project creation created both production and development branches.
  Neon changed Console-created projects to production-only in January 2026;
  automation must discover branch IDs rather than assume a `development` branch.
- **Unverified:** the exact Neon plan for the flagship project, availability of
  protected/anonymized branches, and whether a project-scoped key can perform
  every desired lifecycle operation.
- **Unverified:** this research did not authenticate to Neon or run create/reset/
  delete commands against the live project. Existing operations docs record the
  production project and a prior restore drill; this note did not repeat it.

## Suggested follow-up

- Add a task to choose and document the Neon account/project/branch ownership
  model, including the production branch ID and protection status.
- Add a security-reviewed masking inventory before any production-derived mirror
  exists. This should be treated as a data-handling change, not merely CI plumbing.
- Add lifecycle tasks/workflows only after pinning a current Neon CLI/action and
  testing create → migrate → verify → delete against a non-production project.
- **ADR needed:** reconcile the already-live Neon provider with
  `INITIAL_VISION.md` and ADR 0003. Branch automation itself does not require a
  separate ADR once that provider decision is recorded.
- Update operations docs from the legacy `neonctl` spelling to current `neon`
  when implementation work next touches those runbooks; keep the alias only as
  an explicit compatibility note.
- **New (P19-012):** file a task to decide required-check vs. on-demand-trigger for the
  migration test harness in "Migration test harness" above, then implement it as a GitHub
  Actions workflow once that's decided and Neon CI credentials exist (see
  `docs/operations/ci.md`). Filed as P19-016 in `tasks.md`.
- **New (P19-012):** the harness's step 5 schema-diff check assumes `neon branches
schema-diff` output is stable/parseable enough to gate CI on; verify its exact output
  format (text vs. `-o json`) against a real project before wiring a pass/fail check on it
  — this note only confirmed the subcommand exists via `--help`, not its output shape,
  since no authenticated project was reachable in this session.
