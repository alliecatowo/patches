# Schema drift gate

Weekly + on-demand check that the schema produced by the repo's TypeORM
migrations still matches a checked-in Atlas HCL snapshot —
`infra/scripts/schema.snapshot.hcl`. Implemented by
`.github/workflows/schema-drift.yml` and `infra/scripts/schema-drift.mjs`
(P19-025; research basis: `docs/research/atlas-reshape.md`). **It is not a
required check and never runs on `pull_request`** — `ci.yml` owns the PR path;
this gate must not slow it.

## What it catches (and what it can't)

The workflow applies **all** migrations to an empty `postgres:17-alpine`
service container, runs `atlas schema inspect` (community edition, pinned
`v1.3.1`, sha256-verified in the workflow) against it, and diffs the HCL
against the snapshot. That catches:

- a migration landing without the snapshot being regenerated (the normal
  weekly failure), and
- a migration whose real effect differs from what an older snapshot recorded
  (e.g. a migration edited after its snapshot was taken).

It **cannot** catch out-of-band production changes (a manual `ALTER TABLE`, a
Neon console edit): there is no production connection string anywhere in CI
(grep `secrets.` over `.github/` — only Fly/Neon/R2/Cloudflare tokens exist),
and none was invented. When the repository owner adds a read-only secret
(e.g. `PROD_DATABASE_URL_RO`), a follow-up job can `atlas schema inspect`
production against this same snapshot — schema metadata only, URL never
printed.

## When a migration lands

Regenerate the snapshot in the same PR as the migration, one of two ways:

- **Preferred**: dispatch the _Schema drift_ workflow on that PR's branch with
  `regenerate=true` — it opens a PR against your branch's base that rewrites
  `infra/scripts/schema.snapshot.hcl`; merge/cherry-pick it into the migration
  PR.
- **Locally** (against a throwaway Postgres 17, never production):

  ```sh
  podman run -d --name patches-drift-pg -p 127.0.0.1:55432:5432 \
    -e POSTGRES_USER=patches -e POSTGRES_PASSWORD=patches -e POSTGRES_DB=patches_drift \
    docker.io/library/postgres:17-alpine
  DATABASE_URL="postgres://patches:patches@127.0.0.1:55432/patches_drift" pnpm db:migrate
  DATABASE_URL="postgres://patches:patches@127.0.0.1:55432/patches_drift" \
    node infra/scripts/schema-drift.mjs --regenerate
  ```

  Then commit the snapshot. The script never commits anything by itself.

The snapshot must be produced by Postgres 17 (CI/compose pin) and the pinned
atlas version — different versions may render HCL differently. To bump atlas:
update version + sha256 in the workflow and regenerate the snapshot in the
same PR.

## Failure output

`schema-drift.mjs` exits 1 and prints a structural summary
(`+` database-only, `-` snapshot-only, `~` changed) followed by a full unified
diff — schema metadata only, never row data; connection strings are redacted
from any error output. `--regenerate` exits 0 after rewriting the snapshot.
