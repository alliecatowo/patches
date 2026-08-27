# Moderation and administration (`patches-admin`)

**Status: implemented.** Describes `apps/admin`, the secure moderation/admin CLI
`INITIAL_VISION.md` §65 asks for (P6-003), extended by Amendment C's decentralized-moderation
transparency layer (§201, P14-011/012/013). Verified locally against a real Postgres database
on 2026-08-19 — every command below was actually run once as part of building this doc; see
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

domain block <domain> [--reason <text>] [--reason-category <category>]
domain unblock <domain>
domain list
domain review-list <file>

appeal list [--status open]
appeal inspect <id>
appeal resolve <id> --outcome <upheld|overturned|modified> --reason <text>

audit-log list [--actor <id>] [--admin <id>] [--since <iso>] [--limit N]
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
  re-blocking an already-blocked domain updates `reason`/`reason_category` rather than
  erroring; `unblock` refuses if the domain isn't currently blocked. `--reason-category`
  (P14-012, spec §201.4/§201.5) is one of `harassment|hate|threats|doxxing|impersonation|
spam|illegal_content|ncii|infrastructure_abuse|other` — the bounded, **published** category
  (`domain_blocks.reason_category`, exposed via `ModerationService.ListModerationLog` and
  `NodeService.GetNodePolicy`), distinct from the free-text `--reason`, which stays the
  operator's own private note. Omitting it defaults to `other`, but an unrecognized value is
  rejected rather than silently coerced. `block` also writes a `moderation_log_entries` row
  in the same transaction — the public, fully-identified domain-kind transparency-log entry
  (spec §201.4); `unblock` does not (there is no `UNBLOCK` entry in the log's bounded action
  vocabulary — relief isn't logged the same way enforcement is).
- **`domain review-list <file>`** (P14-013, spec §201.6) reads a third-party domain blocklist
  — one domain per line, `#`-prefixed/blank lines ignored — and prints each candidate with
  whether it's already blocked. **Writes nothing to `domain_blocks`**; it is a review aid,
  not a write path. Decide per domain and run `domain block` yourself for the ones you want.
- **`appeal resolve`** (P14-011, spec §201.3) sets the appeal's `status` to `UPHELD`/
  `OVERTURNED`/`MODIFIED`, records `resolved_at`/`resolved_by_user_id`/`resolution_reason`,
  and writes its own `admin_audit_log` row (`action: 'appeal.resolve'`) — the resolution is
  itself an enforcement-adjacent action and gets the same accountability trail the original
  action did. It does **not** automatically reverse anything: overturning a suspension does
  not unsuspend the account — run `user unsuspend` yourself. Refuses if the appeal isn't
  currently `OPEN`.
- **`audit-log list`** (§158, #172) reads `admin_audit_log` directly — the general-purpose
  companion to the incidental audit-log lookup `appeal inspect` already did for report-driven
  suspensions only. `--actor <id>` filters on the row's subject (`subject_id` — the account,
  invite, post, job, or domain the action was about), `--admin <id>` on `admin_user_id` (the
  operator who ran the command), `--since <iso>` on `created_at`. Always newest-first
  (`ORDER BY created_at DESC`) with a plain `LIMIT` (default 50) — no `--offset`/`--page`
  (spec §153). Prints exactly `time`/`admin`/`action`/`target`/`reason`; `reason` is
  `metadata.reason` when the writing command set one (`user.suspend`, `domain.block`, ...)
  and blank otherwise — the full `metadata` blob isn't printed even under `--json`.

## Moderation notices, appeals, and the public log (Amendment C, spec §201)

Every node enforcement action that affects a specific actor (today: `user suspend`, `user
delete`, and `report resolve --action remove-post|suspend`) is visible to the acted-upon
actor as a **moderation notice** — `ModerationService.ListMyModerationNotices`, a live,
authenticated gRPC read projection of the `admin_audit_log` row that recorded it. There is no
separate `moderation_notices` table: the notice's explanation is generated at read time from
that row (never from `reports.moderator_note` — §55's "no user-facing RPC exposes an internal
moderator note" applies here too), and its reason category defaults to `other` unless the
writing command's `admin_audit_log.metadata` carries a `reasonCategory`.

The affected actor may then file an appeal — `AppealService.CreateAppeal`, one per notice,
within the node's appeal window (`APPEAL_WINDOW_DAYS`, default 14 days) — and both
`ListMyModerationNotices` and every `AppealService` RPC remain reachable **even from a
suspended account** (`SuspensionTolerantAuthGuard`, `apps/server/src/modules/moderation/
suspension-tolerant-auth.guard.ts`): a suspension is exactly the action being appealed, so
the ordinary `AuthGuard`'s blanket "a suspended account can't call any authenticated RPC"
would make the appeal mechanism unreachable for its single most common case. A **deleted**
account has no such carve-out — once `user delete` sets `deleted_at`, the account's access
token is already treated as gone everywhere in this codebase, so there is currently no live
session left to view a ban notice through. That's a real gap, not a design choice; closing it
would need a grace-period-aware session check and is filed as a follow-up.

`ModerationService.ListModerationLog` is the **public**, unauthenticated transparency log
(spec §201.4): domain-kind entries are fully identified (`patches-admin domain block` writes
one in the same transaction as its `domain_blocks`/`admin_audit_log` writes); account/post/
media-kind entries are anonymized by construction — the `moderation_log_entries` table has no
actor-id/post-id/handle column to leak in the first place. Today only `domain block` writes
to this table; `user suspend|delete`/`report resolve` producing an anonymized log entry too
is a follow-up for whoever next touches `apps/admin/src/commands/{user,report}.ts` (outside
this task's owned file set).

`NodeService.GetNodePolicy` (unauthenticated, cacheable, spec §197.6) publishes this node's
operator-transparency document — privacy notice/policy URL, moderator contact, federation
stance, the public `domain_blocks` policy, retention windows, label vocabulary, and the
appeal window/deletion grace period — from the env vars documented in `.env.example`
(`NODE_POLICY_URL`, `NODE_MODERATORS`, `FEDERATION_STANCE`, `DATA_LOCATION`,
`PRIVACY_NOTICE_VERSION`, `APPEAL_WINDOW_DAYS`, `ACCOUNT_DELETION_GRACE_PERIOD_DAYS`). All are
optional; an unset field renders as "this node publishes no policy" for that field rather
than hiding the screen, exactly as the proto's own doc comment says.

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
DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_admin mise run admin -- domain block doc-example.test --reason "documentation example" --reason-category spam --as <existing-handle>
DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_admin mise run admin -- domain list --as <existing-handle>
DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_admin mise run admin -- domain review-list /tmp/blocklist-doc-example.txt --as <existing-handle>
DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_admin mise run admin -- domain unblock doc-example.test --as <existing-handle>
DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_admin mise run admin -- appeal list --as <existing-handle>
DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_admin mise run admin -- appeal inspect <appeal-id> --as <existing-handle>
DATABASE_URL=postgres://patches:patches@127.0.0.1:5432/patches_test_admin mise run admin -- audit-log list --limit 5
```

The full command surface (including `suspend`/`unsuspend`/`delete`, `report resolve` with
both `remove-post` and `suspend` actions, `post remove`, `jobs replay`, `domain block` with
`--reason-category`, `domain review-list`, and `appeal list|inspect|resolve`) is exercised by
`apps/admin/test/admin-cli.integration.test.ts` against a real database on every
`pnpm test:integration` run — `appeal resolve` specifically was run against the same database
while writing this doc, both successfully (`--outcome overturned`) and refused (a second
`resolve` on an already-resolved appeal, and an unrecognized `--outcome`).
