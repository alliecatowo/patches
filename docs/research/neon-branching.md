# Neon branching for local, dev-mirror, and production databases

Verified: **2026-08-22** against official Neon CLI, branching, protected-branch,
GitHub Actions, API-key, and data-anonymization documentation.

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
