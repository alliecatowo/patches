# Backups and restore

**Status: PLANNED.** No production database exists yet as of 2026-08-17 (Phase 0), so
nothing in this document is operational today. `INITIAL_VISION.md` §90 requires backups to
be "enabled/verified" and the restore procedure, migration rollback policy, and data-loss
expectations to be documented before Phase 7 (deploy public v0) — this document is that
placeholder, to be filled in with real, tested procedures once a production database
exists.

## Scope

Covers the production PostgreSQL database (Fly Managed Postgres) and, secondarily, media
stored in Cloudflare R2. R2 objects are treated as less urgent to back up separately in the
alpha phase, since R2 itself is a durable object store — the priority is the relational
database, which holds identity, the social graph, and moderation state.

## Backup mechanism

**Status: PLANNED.** Fly Managed Postgres provides managed backup capability; the specific
mechanism (automatic snapshot schedule, retention window, point-in-time recovery
availability) must be confirmed against current Fly documentation at the time backups are
configured (Phase 7), not assumed from this document. Record the actual configuration here
once set up:

- backup frequency: _TBD_
- retention window: _TBD_
- point-in-time recovery available: _TBD_

## RPO / RTO expectations (alpha)

**Status: PLANNED — targets to be set explicitly before Phase 7, not left implicit.**
Proposed starting targets appropriate for a small alpha service (hundreds to low thousands
of users, per `INITIAL_VISION.md` §125):

- **Recovery Point Objective (RPO):** target no more than 24 hours of data loss in a
  worst-case database failure during alpha. Tighten this once backup frequency is
  finalized — if Fly Managed Postgres offers point-in-time recovery, the real RPO may be
  much smaller and should be documented as such.
- **Recovery Time Objective (RTO):** target same-day recovery during alpha (this is not a
  24/7 on-call service yet). Document the actual restore procedure's measured duration
  once it's been tested end to end — don't leave this as an unverified assumption.

These are alpha-appropriate targets, not commitments made to end users as an SLA. Revisit
once the service has real usage and stakes.

## Restore procedure

**Status: PLANNED.** Outline to be filled in and tested once production exists:

1. Identify the target restore point (latest backup, or a specific point-in-time if
   supported).
2. Provision a restore target (per Fly Managed Postgres's documented restore flow at
   implementation time).
3. Validate the restored database against a checklist (row counts on key tables, schema
   version/migration state matches expectations, spot-check recent known data).
4. Cut the application over to the restored database (update `DATABASE_URL` secret,
   redeploy).
5. Confirm application health checks pass and smoke tests succeed against the restored
   database before considering the incident resolved.

## Verify-restore cadence

**Status: PLANNED.** An untested backup is not a backup. Once backups are configured, this
document must specify and then follow a periodic restore-drill cadence (e.g. quarterly) to
confirm a real restore actually works end to end, not just that a backup file exists.
Record the date and outcome of each drill here once the practice starts.

## Related documents

- `docs/operations/database.md` — migration and schema-change policy.
- `docs/operations/incidents.md` — incident response process, including when a restore is
  the appropriate response.
- `docs/product/roadmap.md` — MVP deployment checklist requires "backup strategy exists"
  and "restoration procedure is documented" as literal go/no-go gates.
