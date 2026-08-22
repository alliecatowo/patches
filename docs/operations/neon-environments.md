# Neon database environments

**Status: helpers implemented and locally tested; provider setup incomplete.** The helper's
27 assertions pass, but no real dev mirror has been created. Neon's branch-protection API
returned plan-limit HTTP 422 for the production branch, which therefore remains unprotected;
the guarded helper checks do not substitute for that provider control.

Patches has three database tiers. The default developer path remains local
Compose Postgres with synthetic data; cloud credentials are never required for
ordinary development.

| Tier       | Purpose                                           | Data and access boundary                                                      |
| ---------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| local      | Fast development and the normal integration suite | Disposable Compose Postgres; synthetic fixtures only                          |
| dev mirror | Controlled source for cloud test branches         | Neon branch anonymized from production and approved only after leakage checks |
| production | Live node                                         | Protected Neon branch; never the default parent or a test target              |

The topology and CLI behavior are based on the verified Neon references in
`docs/research/neon-branching.md`. Provider selection still needs the ADR noted
there; this runbook does not reinterpret that architectural decision.

## Prerequisites

Install the pinned tools with `mise install`, then authenticate interactively
with `neon auth` or export a project-scoped `NEON_API_KEY`. Do not put credentials
in `mise.toml`, shell history, command arguments, logs, or committed files.

Configure these values in a private shell or `.mise.local.toml`:

```toml
[env]
NEON_PROJECT_ID = "your-project-id"
NEON_DEV_MIRROR_BRANCH = "anonymized-dev-mirror-id"
NEON_PRODUCTION_BRANCH = "production-branch-id"
NEON_DEV_DATABASE = "neondb"
NEON_DEV_ROLE = "neondb_owner"
```

`NEON_DEV_MIRROR_BRANCH` must identify an anonymized, leakage-tested mirror—not
production. Creating the mirror is deliberately outside this helper because its
masking inventory needs security review. At minimum, leakage checks must cover
email and auth identifiers, profile data, DM bodies, IP/moderation audit data,
and token/code material. Branch isolation alone does not anonymize copied rows.

Keep the production branch protected in Neon. `NEON_PRODUCTION_BRANCH` is
required: the helper resolves both configured references before every command,
refuses to run if the mirror resolves to production, and refuses to mutate either
branch by name or ID.

## Local development

Use the existing local workflow unless a cloud-faithful database is necessary:

```sh
mise run compose -- up -d
pnpm db:migrate
mise run test
```

This tier is disposable, uses synthetic test data, and never contacts Neon.

## Ephemeral dev branches

Create a short-lived child of the configured mirror:

```sh
mise run neon:dev:create -- --name patches-my-task --ttl-hours 8
mise run neon:dev:status
mise run neon:dev:migrate
mise run neon:dev:test
```

Names accept lowercase letters, digits, and hyphens and are limited to 63
characters. TTL is mandatory and limited to 1–168 hours; the default is 24.
Creation records only non-secret branch metadata in
`.mise/neon-dev-branch.json`, which is gitignored and mode `0600`. The helper
always passes an explicit parent and expiry. Its concise JSON output is suitable
for agents and scripts.

To inspect data without exposing a connection string:

```sh
mise run neon:dev:connect
```

The helper supplies the connection string to `psql` through its process
environment. Migration and test tasks likewise use process-scoped
`DATABASE_URL`/`TEST_DATABASE_URL`; they never print or persist the value. The
test task prepares the isolated `*_test` databases required by the repository's
integration projects on that ephemeral branch, so its Neon role needs permission
to create databases.
`neon` is the current CLI name. The helper accepts the documented `neonctl`
compatibility alias only when `neon` is unavailable.

Use `--branch <id-or-name>` to select an ephemeral child without changing saved
state. The helper re-verifies that every selected or saved branch is a direct child of the
configured dev mirror before connecting or mutating. Never point these tasks at a shared mirror or production.
Tests are destructive to their target and therefore belong only on an ephemeral
child.

## Reset and cleanup

Reset discards branch changes and refreshes the child from its parent:

```sh
mise run neon:dev:reset
```

Destroy permanently deletes the branch:

```sh
mise run neon:dev:destroy
```

Both commands require typing the exact branch ID/name. `--yes` is available for
reviewed non-interactive cleanup. Neither command will target the configured dev
mirror or `NEON_PRODUCTION_BRANCH`. Expiration is a fail-safe, not the primary
cleanup path: explicitly destroy branches after tests and on cancelled or failed
work, then use `neon:dev:status -- --branch <id>` to confirm that the ID no longer
exists.

An explicit `--parent` on create is an exceptional production-parent override.
It requires both `--i-know-this-is-production` and typing
`USE PRODUCTION PARENT`; `--yes` does not bypass that prompt. A direct production
child contains production data and must not be shared or used by ordinary CI.
Its state records the canonical parent ID and production provenance. Reset or
destroy requires typing `RESET PRODUCTION-DERIVED <branch>` or
`DELETE PRODUCTION-DERIVED <branch>` respectively; `--yes` cannot bypass this
second confirmation. Keep the state file until cleanup succeeds, because an
explicit branch reference alone is intentionally insufficient to classify a
production-derived child as managed.

If a process dies before cleanup, Neon deletes the branch at its RFC 3339 expiry.
Operators should periodically list branches in the Neon console/CLI and delete
expired-looking task branches by exact ID. Never implement cleanup by a broad
name glob, and never include the mirror or production IDs in a cleanup query.
