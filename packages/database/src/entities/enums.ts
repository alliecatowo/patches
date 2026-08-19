/**
 * Enum-ish column values. Stored as `text` with a named `CHECK` constraint rather than a
 * native PostgreSQL `enum` type: adding or renaming a value on a native enum needs
 * `ALTER TYPE ... ADD VALUE` (which cannot run inside a transaction block in older PG and
 * can't remove values at all), whereas a CHECK constraint is a plain
 * drop-and-recreate in a migration. Recommended by `docs/research/typeorm-postgres.md` §7.
 *
 * Each list is the single source of truth for both the TS union type and the SQL CHECK
 * expression (via `checkIn`), so the two can never drift.
 */

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const POST_TYPES = ['NOTE', 'LINK'] as const;
export type PostType = (typeof POST_TYPES)[number];

export const POST_VISIBILITIES = ['PUBLIC', 'UNLISTED', 'FOLLOWERS'] as const;
export type PostVisibility = (typeof POST_VISIBILITIES)[number];

/**
 * Follow edge status (`INITIAL_VISION.md` §50). `NONE` is deliberately absent from this list:
 * it is represented by no `follows` row existing at all, not a row with that status — see
 * `follow.entity.ts`.
 */
export const FOLLOW_STATUSES = ['PENDING', 'FOLLOWING'] as const;
export type FollowStatus = (typeof FOLLOW_STATUSES)[number];

export const MEDIA_STATES = ['PENDING_UPLOAD', 'PROCESSING', 'READY', 'FAILED', 'DELETED'] as const;
export type MediaState = (typeof MEDIA_STATES)[number];

/**
 * How a user proves who they are (`INITIAL_VISION.md` §162+, ADR 0011). Identity is the
 * account; a password is just one credential among several, and email is only a recovery
 * channel.
 */
export const CREDENTIAL_TYPES = ['PASSWORD', 'SSH_PUBLIC_KEY', 'GITHUB', 'PASSKEY'] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const AUTH_CODE_PURPOSES = ['VERIFY_EMAIL', 'RESET_PASSWORD'] as const;
export type AuthCodePurpose = (typeof AUTH_CODE_PURPOSES)[number];

/** Notification row types (`INITIAL_VISION.md` §56, §113). `MODERATION` is reserved — no RPC
 * creates one yet (moderator-initiated notices land with the admin CLI, spec §65). */
export const NOTIFICATION_TYPES = ['FOLLOW', 'LIKE', 'REPLY', 'MENTION', 'MODERATION'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** A report's target (`INITIAL_VISION.md` §64's `subject_type`). `GUESTBOOK_ENTRY` (P45-003)
 * is reportable per §172 ("guestbook entries are ... reportable, §64") — `ModerationService`
 * has no guestbook-entry RPC, so `PageService.ReportGuestbookEntry` (`pages.proto`) writes
 * this subject type directly into the same `reports` table `ModerationService` uses, rather
 * than duplicating the report model. */
export const REPORT_SUBJECT_TYPES = ['ACTOR', 'POST', 'GUESTBOOK_ENTRY'] as const;
export type ReportSubjectType = (typeof REPORT_SUBJECT_TYPES)[number];

export const REPORT_REASONS = [
  'SPAM',
  'HARASSMENT',
  'HATE_SPEECH',
  'ILLEGAL_CONTENT',
  'IMPERSONATION',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** `INITIAL_VISION.md` §64. */
export const REPORT_STATUSES = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Job lifecycle (`docs/architecture/jobs.md` §2): claimable rows are `PENDING`, a worker
 * flips them to `PROCESSING` while it holds them, then `COMPLETED`, back to `PENDING` with
 * a later `available_at` on a retryable failure, or `DEAD` once `attempts >= max_attempts`.
 * `FAILED` is the terminal-but-not-retryable state for a job a handler rejects outright.
 */
export const OUTBOX_JOB_STATUSES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'DEAD',
] as const;
export type OutboxJobStatus = (typeof OUTBOX_JOB_STATUSES)[number];

/** `admin_audit_log.subject_type` (`INITIAL_VISION.md` §66) — what kind of row a `patches-admin`
 * command acted on. */
export const ADMIN_AUDIT_SUBJECT_TYPES = [
  'USER',
  'INVITE',
  'REPORT',
  'POST',
  'JOB',
  'DOMAIN',
] as const;
export type AdminAuditSubjectType = (typeof ADMIN_AUDIT_SUBJECT_TYPES)[number];

/** `pages.visibility` (`INITIAL_VISION.md` §170-172) — mirrors `posts.visibility`'s
 * vocabulary minus `FOLLOWERS`, which has no meaning for a Page (there is no per-viewer
 * follow-gated rendering in v1). */
export const PAGE_VISIBILITIES = ['PUBLIC', 'UNLISTED'] as const;
export type PageVisibility = (typeof PAGE_VISIBILITIES)[number];

/** `posts.quote_policy` (`INITIAL_VISION.md` §189, Amendment B) — who may quote a post.
 * Re-checked server-side on every quoting `CreatePost` (§192), never inferred from the
 * client. */
export const QUOTE_POLICIES = ['ANYONE', 'FOLLOWERS', 'NOBODY'] as const;
export type QuotePolicy = (typeof QUOTE_POLICIES)[number];

/** `community_members.role` (`INITIAL_VISION.md` §189). A community moderator's authority
 * stops at the community boundary (§192) — there is no cross-community role. */
export const COMMUNITY_ROLES = ['MEMBER', 'MODERATOR'] as const;
export type CommunityRole = (typeof COMMUNITY_ROLES)[number];

/** `community_invites.status` (`INITIAL_VISION.md` §189). */
export const COMMUNITY_INVITE_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED'] as const;
export type CommunityInviteStatus = (typeof COMMUNITY_INVITE_STATUSES)[number];

/** `conversations.kind` (`INITIAL_VISION.md` §189). Group conversations are capped at 8
 * members total (§188), enforced in the service layer. */
export const CONVERSATION_KINDS = ['DIRECT', 'GROUP'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

/** `message_requests.status` (`INITIAL_VISION.md` §189). At most one pending request per
 * (sender, recipient) pair (§188) — enforced by a partial unique index, see
 * `message-request.entity.ts`. */
export const MESSAGE_REQUEST_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED'] as const;
export type MessageRequestStatus = (typeof MESSAGE_REQUEST_STATUSES)[number];

/**
 * Builds `"column" IN ('A', 'B')` for a `@Check(...)` expression from a value list, so the
 * TS union and the database constraint are generated from the same array. Values are
 * compile-time string literals from this module only — never user input — so the simple
 * quoting here is safe.
 */
export function checkIn(columnName: string, values: readonly string[]): string {
  return `"${columnName}" IN (${values.map((value) => `'${value}'`).join(', ')})`;
}
