# Backups and restore

**Status: implemented 2026-08-18.** Production `DATABASE_URL` (Fly app `patches-social`)
points at Neon (project `patches`, id `shy-recipe-96135980`, org
`org-plain-leaf-04797948`, region `aws-us-east-2`, default branch `production`
(`br-twilight-dew-axkmolfo`), database `neondb`, role `neondb_owner`, `sslmode=require`).
The former Fly Postgres cluster (`patches-social-db`) that the live node originally ran on
(see `tasks.md` A-041) is stopped and kept as a cold fallback, not actively used. This
document covers both: Neon's built-in point-in-time recovery/branching as the primary
restore mechanism, the Fly volume's daily snapshots as a fallback-cluster safety net, and a
logical `pg_dump` (`infra/scripts/db-dump.sh`) as an independent, portable, off-platform
copy.

Per `INITIAL_VISION.md` §90 (backups "enabled/verified" before Phase 7 deploy) and §159
("backup strategy exists", "restoration procedure is documented").

## Scope

Covers the production PostgreSQL database (Neon). Media (Cloudflare R2) is **not yet live in
production** — `docs/operations/deployment.md` notes R2 credentials are not set on the live
node (`tasks.md` B-031) — so R2 backup is `Status: planned`, not applicable to any real data
yet.

## Backup mechanisms

### 1. Neon point-in-time recovery + branching (primary)

Neon retains a continuous history of WAL for the project, letting you create a new branch
from the production branch at any point within the retention window (`neonctl branches
create --parent production`, optionally `--parent production@<timestamp>` for a specific
point in time) — this is Neon's native PITR mechanism and the primary restore path. This
document does not restate Neon's plan-specific retention window as a fixed number (get the
current value from the Neon dashboard/`neonctl` at restore time — plan limits can change) —
what's verified here is that branch creation/deletion/connection-string retrieval all work
against project `shy-recipe-96135980` (see "Restore drill" below).

### 2. Fly volume snapshots (fallback cluster only)

The stopped Fly Postgres cluster `patches-social-db`'s volume (`vol_r1j3on1n5m85wpwr`) has
scheduled daily snapshots with 14-day retention, set via:

```bash
flyctl volumes update vol_r1j3on1n5m85wpwr --snapshot-retention 14
```

A manual snapshot was also taken at cutover time. This cluster is not the production
database anymore (Neon is) — these snapshots exist only so the fallback path isn't itself
unbacked-up while it's kept around.

### 3. Logical dump via `pg_dump` (secondary, off-platform)

`infra/scripts/db-dump.sh` runs `pg_dump --no-owner --no-privileges` against the current
production `DATABASE_URL` (resolved via `neonctl connection-string --project-id
shy-recipe-96135980`, reading `NEON_API_KEY` from the repo-root `.env`) through podman
(`docker.io/library/postgres:18-alpine`, matching the server's Postgres 18), gzips the
output to `backups/patches-<UTC timestamp>.sql.gz` (gitignored — see `.gitignore`), then
prints row counts for `users` and `posts` as a sanity check. Run it with `mise run db:dump`.
It never prints the connection string or any secret.

**Nightly automation: Status: planned.** No cron or CI job runs this on a schedule yet. The
intended shape, to wire up when someone owns it:

- A GitHub Actions scheduled workflow, e.g. `.github/workflows/backup.yml` (not created by
  this change — out of this change's owned file set), `on: schedule: cron: '0 9 * * *'`
  (roughly nightly), running `infra/scripts/db-dump.sh` with `NEON_API_KEY` from a repo
  secret, then uploading the resulting `.sql.gz` as a build artifact or to an off-platform
  bucket (R2, S3, etc. — not yet decided) rather than committing it (it's gitignored on
  purpose — real user data does not belong in git history).
- Alternative for a single-owner project at this stage: a plain cron entry on the owner's
  own machine running `mise run db:dump` and syncing `backups/` somewhere durable. Either
  is acceptable; neither is done yet, so treat "off-platform logical backup" as **not
  currently happening on a schedule** — only the manual run recorded below has actually
  happened.

## RPO / RTO expectations (alpha)

- **Recovery Point Objective (RPO):** Neon's continuous PITR means the achievable RPO for a
  branch-restore is effectively seconds-to-minutes (bounded by replication lag, not by a
  backup schedule) — much tighter than the old Fly-Postgres-snapshot-based estimate. Until
  nightly `pg_dump` automation exists (see above), the _off-platform_ logical-dump RPO is
  "whenever someone last ran `mise run db:dump` by hand" — currently 2026-08-18 (see "Restore
  drill" below). Don't rely on the manual dump as the real safety net; Neon PITR is.
- **Recovery Time Objective (RTO):** measured for the branch-based restore path during the
  drill below: branch creation was near-instant (Neon reported `Current State: ready`
  seconds after `branches create` returned). The _application_ cutover (pointing
  `DATABASE_URL` at the restored branch and rolling Fly Machines) was not exercised in this
  drill — target same-day recovery during alpha, consistent with `flyctl secrets set`'s
  documented rollout behavior (rolls machines, typically completes within a few minutes),
  but that number itself is `Status: planned` until actually timed end to end.

These are alpha-appropriate targets, not commitments made to end users as an SLA.

## Restore drill (2026-08-18)

### A. Neon branch create/connect/delete (verified, throwaway)

Ran twice against project `shy-recipe-96135980` — once to confirm the create/delete
mechanics, once more (after learning `neonctl connection-string` takes the branch as a
**positional** argument, not a `--branch-id` flag) to confirm the branch's connection string
actually resolves to a distinct endpoint host:

```bash
neonctl branches create --project-id shy-recipe-96135980 --name restore-drill-verify-20260818 \
  --parent production --api-key "$NEON_API_KEY"
# -> branch br-misty-sea-ax7rqalh, Current State: ready

neonctl connection-string br-misty-sea-ax7rqalh --project-id shy-recipe-96135980 --api-key "$NEON_API_KEY"
# -> postgresql://neondb_owner:***@ep-spring-tooth-axawfnbt.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
# (distinct endpoint host from production's ep-cold-sound-axlidsoo — confirms the branch is a real,
# independently-connectable copy, not just a metadata record)

neonctl branches delete br-misty-sea-ax7rqalh --project-id shy-recipe-96135980 --api-key "$NEON_API_KEY"
```

Both throwaway branches created during this drill (`restore-drill-20260818`,
`restore-drill-verify-20260818`) were deleted immediately after verification; neither was
left running. **Not exercised in this drill**: pointing `DATABASE_URL` at a restored branch
and rolling `patches-social`'s Fly Machines (`flyctl secrets set -a patches-social
DATABASE_URL=<branch connection string>`) — that's the remaining step to a full production
cutover drill, `Status: planned`.

### B. Logical dump + restore into a scratch database (verified, full round trip)

```bash
mise run db:dump
# db-dump: dumping to backups/patches-20260819T001454Z.sql.gz ...
# db-dump: wrote backups/patches-20260819T001454Z.sql.gz (12K)
# db-dump: row counts ...
# users|2
# posts|2
# db-dump: done
```

12 KB compressed, 2 users and 2 posts in production as of the drill (an alpha with real but
small usage — consistent with `docs/operations/deployment.md`'s "two real accounts"
smoke-test note).

```bash
podman run --rm --network host -e PGPASSWORD=patches docker.io/library/postgres:18-alpine \
  psql "postgres://patches:patches@127.0.0.1:5432/patches" -c "create database patches_restore_test"
# CREATE DATABASE

mise run db:restore -- backups/patches-20260819T001454Z.sql.gz \
  "postgres://patches:patches@127.0.0.1:5432/patches_restore_test" --yes
# ... schema DDL (CREATE TABLE/INDEX/ALTER TABLE for every migrated entity) ...
# db-restore: done

podman run --rm --network host -e PGPASSWORD=patches docker.io/library/postgres:18-alpine \
  psql "postgres://patches:patches@127.0.0.1:5432/patches_restore_test" \
  -Atc "select 'users', count(*) from users union all select 'posts', count(*) from posts"
# users|2
# posts|2

podman run --rm --network host -e PGPASSWORD=patches docker.io/library/postgres:18-alpine \
  psql "postgres://patches:patches@127.0.0.1:5432/patches" -c "drop database patches_restore_test"
# DROP DATABASE
```

Restored counts (`users=2`, `posts=2`) matched the dump's own reported counts exactly. The
scratch database was dropped immediately after verification.

`infra/scripts/db-restore.sh` also refuses to target anything that looks like the production
host (matches `neon.tech`) unless `--i-know-this-is-production` is passed — verified
separately by pointing it at a Neon-shaped connection string without that flag and confirming
it exits non-zero without attempting anything:

```bash
infra/scripts/db-restore.sh backups/patches-20260819T001329Z.sql.gz \
  "postgres://user:pass@ep-cold-sound-axlidsoo.c-4.us-east-2.aws.neon.tech/neondb" --yes
# db-restore: refusing to target what looks like the production database (neon.tech)
# db-restore: pass --i-know-this-is-production if this is really intended
# exit=1
```

## Restore procedure

**Primary path — Neon branch restore** (use for restoring production state, including
point-in-time):

1. `neonctl branches create --project-id shy-recipe-96135980 --name restore-<date> --parent production[@<timestamp>] --api-key "$NEON_API_KEY"` — `@<timestamp>` targets a point in time within Neon's retention window; omit it to branch from the current head.
2. `neonctl connection-string <branch-id-or-name> --project-id shy-recipe-96135980 --api-key "$NEON_API_KEY"` to get the new branch's connection string.
3. Validate the restored branch against a checklist: row counts on key tables (`users`, `posts`, and others as needed), schema/migration state matches expectations, spot-check recent known data.
4. **Status: planned** (not executed in this drill) — cut the application over: `flyctl secrets set -a patches-social DATABASE_URL=<branch connection string> DATABASE_SSL=true` (rolls Fly Machines), then confirm `release_command` (`node server/migrate.mjs`, `infra/fly/fly.toml`) reports no unexpected pending migrations.
5. Confirm `/healthz` passes and a smoke test (`node apps/tui/dist/cli.js ping`) succeeds before considering the incident resolved.
6. Once confirmed good, either keep the restored branch as the new production branch or set it as Neon's default branch, per Neon's branching docs at the time — not prescribed further here.

**Secondary path — logical dump restore** (portable, works even if Neon itself is
unavailable, e.g. restoring into a fresh Postgres elsewhere):

1. `infra/scripts/db-restore.sh <dump.sql.gz> <target DATABASE_URL>` (interactive
   confirmation; `--yes` to skip; refuses production targets without
   `--i-know-this-is-production`).
2. Same validation checklist as above.
3. Same cutover as step 4 above if the target is meant to become production.

## Verify-restore cadence

**Quarterly drill checklist** (next due: 2026-11-18, i.e. 3 months after this one):

- [ ] Run `mise run db:dump` against production; confirm it succeeds and note size/row
      counts here.
- [ ] Restore that dump into a scratch local database (`patches_restore_test` or similar);
      confirm row counts match; drop the scratch database.
- [ ] Create a throwaway Neon branch from `production` (`restore-drill-<date>`); confirm its
      connection string resolves to a distinct endpoint; delete the branch.
- [ ] If it's been more than a year, or Neon's plan changed, re-verify the PITR retention
      window in the Neon dashboard and update the RPO note above if it changed.
- [ ] Record the date and outcome (pass/fail, any surprises) below.

**Drill log:**

- 2026-08-18: full drill as documented above (branch create/connect/delete ×2, logical
  dump + restore into scratch DB with matching counts, restore-script production-guard
  check). All steps passed.

## Secrets backup

Not covered by any database backup mechanism above — these live outside Postgres entirely:

- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` (Fly secrets on `patches-social`): the **owner** must
  keep the source key material in a password manager (or equivalent secure store) separately
  from Fly. Fly secrets are write-only from the CLI's perspective (no `flyctl secrets get`)
  — if lost without a separate copy, they'd have to be rotated, invalidating all existing
  sessions.
- `FEDERATION_KEY_ENCRYPTION_KEY`: same requirement, higher stakes — this key encrypts
  per-actor federation signing keys at rest. **Losing it loses the ability to decrypt those
  keys**, which for federation (currently `FEDERATION_ENABLED=false`, so not yet in active
  use in production) would mean every actor's federation identity has to be regenerated.
  Keep a copy in a password manager now, before federation is turned on, not after.
- `NEON_API_KEY` (local `.env`, not a Fly secret): used by `infra/scripts/db-dump.sh` and
  the restore drill above. Store in a password manager; rotate via the Neon dashboard if it
  leaks.

## Related documents

- `docs/operations/deployment.md` — "Production database" section covers the Neon
  migration itself and the Fly cutover mechanics.
- `docs/operations/database.md` — migration and schema-change policy.
- `docs/operations/incidents.md` — incident response process, including when a restore is
  the appropriate response.
- `docs/product/roadmap.md` — MVP deployment checklist requires "backup strategy exists" and
  "restoration procedure is documented" as literal go/no-go gates.
