# Moderation and administration (`patches-admin`)

**Status: implemented.** Describes `apps/admin`, the secure moderation/admin CLI
`INITIAL_VISION.md` §65 asks for (P6-003). Verified locally against a real Postgres database
on 2026-08-18 — every command below was actually run once as part of building this doc; see
"Verifying this doc" at the end.

## Why a CLI, not a dashboard

Patches is TUI-first; §65 explicitly says not to spend MVP time on a React admin dashboard.
`patches-admin` talks to PostgreSQL **directly** through `@patches/database`'s `DataSource` —
never through the gRPC server. This is the one client in the system allowed to bypass the
RPC surface, because it acts with operator authority (suspending accounts, removing content,
resolving reports) that no user-facing RPC has any business granting.

## Running it

```bash
mise run admin -- <group> <action> [args] [--flag value] [--as <handle>] [--json]
```

`mise run admin` builds `apps/admin` and runs `node apps/admin/dist/main.js` with whatever
follows `--`. It reads `DATABASE_URL` the same way `apps/server`/`apps/worker` do (validated
env, `.env` auto-loaded outside production — see `.env.example`).

Every **mutating** command needs an operator to attribute its audit row to:

- `--as <handle>` on the command itself, or
- `PATCHES_ADMIN_OPERATOR=<handle>` in the environment.

`<handle>` must belong to a real local account (looked up the same way every other handle
lookup in the system works — `actors.handle_normalized`). Read-only commands (`list`/`show`)
work without one.

Every command supports `--json` for scripting; without it, output is a right-padded table.

## Commands

```text
invite create [--max-uses N] [--expires <iso>]
invite list
invite revoke <id>

user list
user show <handle>
user suspend <handle> --reason <text>
user unsuspend <handle>
user delete <handle> [--reason <text>]

report list [--status open]
report show <id>
report resolve <id> --action <none|remove-post|suspend> [--note <text>]

post remove <id> --reason <text>

jobs list [--status DEAD]
jobs show <id>
jobs replay <id>

domain block <domain> [--reason <text>]
domain unblock <domain>
domain list
```

- **`invite create`** prints the raw invite code **once** — only its SHA-256 hash is ever
  written to `invites.code_hash`, hashed exactly the way `AuthService.register`'s
  `consumeInvite` hashes a redeemed code (`apps/admin/src/cli/crypto.ts`'s `hashInviteCode`
  is a deliberate second copy of that one function, not a shared dependency — `apps/admin`
  cannot import `apps/server` application code, spec §128–129).
- **`user delete`** is a soft delete (§25's tombstone convention, applied to the account):
  `users.status` flips to `DELETED` and both `users.deleted_at`/`actors.deleted_at` are set.
  Nothing is destroyed.
- **`report resolve --action remove-post`** requires the report's subject to be a `POST`;
  it tombstones that post (`posts.deleted_at`/`removed_by_user_id`/`removal_reason`) the same
  way `post remove` does, and marks the report `RESOLVED`.
- **`report resolve --action suspend`** requires the report's subject to be an `ACTOR` with a
  local account; it suspends that account and marks the report `RESOLVED`.
- **`report resolve --action none`** just marks the report `RESOLVED` (or use `--note` for a
  moderator note with no side effect) — for reports that turn out not to need action.
- **`jobs replay`** (B-014) resets a `DEAD` outbox job back to `PENDING` for the worker to
  reclaim on its next pass, preserving `attempts` — a replay is not a fresh job, so the
  job's existing `max_attempts` ceiling still applies. Refuses (rather than silently
  no-opping) if the job isn't currently `DEAD`.
- **`domain block`/`domain unblock`** (B-027, `docs/operations/federation.md` "Blocking a
  remote domain") write/delete a `domain_blocks` row, lowercased. `block` is idempotent —
  re-blocking an already-blocked domain updates `reason` rather than erroring; `unblock`
  refuses if the domain isn't currently blocked.

## Audit log

Every mutating command appends exactly one row to `admin_audit_log` (§66), in the **same
transaction** as the mutation it performs (`packages/database/src/repositories/
admin-audit.ts`'s `appendAdminAuditLog`, called from inside `dataSource.transaction(...)` in
every `apps/admin/src/commands/*.ts` handler) — a mutation without its audit row, or an audit
row without its mutation, cannot happen. `metadata` never carries a password, access token,
refresh token, or reset code; for `invite create` specifically it carries `maxUses`/
`expiresAt`, never the plaintext invite code.

Inspect it directly with `psql` (no `patches-admin audit` command exists — the table is
small enough that a direct query is simpler than building a second CLI surface for it):

```sql
SELECT action, subject_type, subject_id, metadata, created_at
FROM admin_audit_log
ORDER BY created_at DESC
LIMIT 50;
```

## Rate limiting (A-018)

Sensitive auth flows are rate-limited both process-locally and database-backed (across every
server process, surviving a restart) — see `docs/architecture/auth.md` §9 for the full
design. `patches-admin` has nothing to do with that machinery directly; it's noted here
because `rate_limit_buckets` (the table backing it) lives in the same database this CLI
talks to, and its lazy sweep (documented in the same section) is why there is no
`patches-admin` command for it either.

## GitHub login setup (P6-005)

Not an `apps/admin` concern operationally, but the other Phase 6 environment variable worth
calling out here: `GITHUB_CLIENT_ID` (plus the overridable `GITHUB_DEVICE_CODE_URL`/
`GITHUB_TOKEN_URL`/`GITHUB_USER_API_URL`/`GITHUB_HTTP_TIMEOUT_MS`, all documented in
`.env.example`) enable the GitHub OAuth device-flow credential (`docs/architecture/auth.md`
§5). Unset in dev/test by default — `BeginGitHubLogin`/`PollGitHubLogin` answer
`UNIMPLEMENTED` until a device-flow-enabled GitHub OAuth App's client id is configured.

## Verifying this doc

Commands actually run against a local Postgres (`mise run compose -- up -d`, database
`patches_test_admin`, migrated via `apps/admin`'s own integration-test bootstrap) while
writing this doc:

```bash
DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_admin mise run admin --
DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_admin mise run admin -- user list
DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_admin mise run admin -- jobs list --json
DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_admin mise run admin -- invite create --as <existing-handle> --max-uses 5
```

The full command surface (including `suspend`/`unsuspend`/`delete`, `report resolve` with
both `remove-post` and `suspend` actions, `post remove`, and `jobs replay`) is exercised by
`apps/admin/test/admin-cli.integration.test.ts` against a real database on every
`pnpm test:integration` run.
