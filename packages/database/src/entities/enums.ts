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
export const CREDENTIAL_TYPES = [
  'PASSWORD',
  'SSH_PUBLIC_KEY',
  'GITHUB',
  'PASSKEY',
  /** A one-time recovery code (P15-003, `AuthService.GenerateRecoveryCodes`/`RecoveryLogin`).
   * Unlike the other types, an account can hold several live rows of this type at once (up to
   * 10, minted together) — each redeemed code is revoked immediately on use. */
  'RECOVERY_CODE',
  /** A generic OIDC-device-flow credential (P15-006, GitLab/Codeberg/any node-configured
   * provider). Same "credential, never an identity" contract as GITHUB — `identifier` holds
   * `"<provider_id>:<subject>"`, namespaced so two providers' subjects can never collide under
   * the existing `(type, identifier) WHERE revoked_at IS NULL` unique index. */
  'OIDC',
] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const AUTH_CODE_PURPOSES = ['VERIFY_EMAIL', 'RESET_PASSWORD'] as const;
export type AuthCodePurpose = (typeof AUTH_CODE_PURPOSES)[number];

/** Notification row types (`INITIAL_VISION.md` §56, §113, §187, §201.2). `MODERATION` (A-049,
 * A-050) is written directly by the admin CLI — `patches-admin user suspend|delete`, `report
 * resolve --action remove-post|suspend`, and `appeal resolve` (`apps/admin/src/commands/
 * {user,report,appeal}.ts`) — never by an RPC, since every node enforcement action originates
 * there (spec §65). It carries no actor/post/conversation/community reference: the row is a
 * content-free bell pointing the recipient at `ModerationService.ListMyModerationNotices`,
 * which reads the actual notice from `admin_audit_log` (§201.2's "read projection ... not a
 * second source of truth" — see `notice-projection.ts`), not from anything stored here.
 * `MESSAGE` (P11-004, §183.4; re-pointed at E2EE arrivals by ADR 0030 §B-095) is written by
 * `E2eeConversationService.createE2eeConversation`/`sendEnvelopes` — never carries the message
 * body (the node has no plaintext to carry), only `conversation_id` (see
 * `notification.entity.ts`). `REPOST`/`QUOTE` (P11-006, §187) are written by
 * `ReactionsService.repostPost`/`PostService.createPost` respectively. */
export const NOTIFICATION_TYPES = [
  'FOLLOW',
  'LIKE',
  'REPLY',
  'MENTION',
  'MODERATION',
  'MESSAGE',
  'REPOST',
  'QUOTE',
  'COMMUNITY_INVITE',
  /** A follow request awaiting the recipient's approval, because the recipient's account is
   * locked (`INITIAL_VISION.md` §197.5, P14-010's follow-up). Distinct from `FOLLOW`, which is
   * only ever written once a follow (request or otherwise) is actually accepted — see
   * `follow-request.entity.ts`. */
  'FOLLOW_REQUEST',
  /** A security-relevant event on the account's own recipient — currently: a successful
   * `AuthService.RecoveryLogin` (P15-003). Always written with `actor_id = NULL` (there is no
   * "other actor" for your own account), the same convention `MODERATION` uses. */
  'SECURITY',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** A report's target (`INITIAL_VISION.md` §64's `subject_type`). `GUESTBOOK_ENTRY` (P45-003)
 * is reportable per §172 ("guestbook entries are ... reportable, §64") — `ModerationService`
 * has no guestbook-entry RPC, so `PageService.ReportGuestbookEntry` (`pages.proto`) writes
 * this subject type directly into the same `reports` table `ModerationService` uses, rather
 * than duplicating the report model. `MESSAGE` (the plaintext-DM report/evidence-snapshot
 * subject, P11-004, §183.4) was removed by ADR 0030 §B-095 alongside the rest of the
 * server-visible DM machinery it existed to snapshot evidence for — `E2EE_MESSAGE` (P13-019,
 * ADR 0020 §9) is the only message-report subject type now. */
export const REPORT_SUBJECT_TYPES = ['ACTOR', 'POST', 'GUESTBOOK_ENTRY', 'E2EE_MESSAGE'] as const;
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
  'COMMUNITY',
  'LABELER',
] as const;
export type AdminAuditSubjectType = (typeof ADMIN_AUDIT_SUBJECT_TYPES)[number];

/** `pages.visibility` (`INITIAL_VISION.md` §170-172) — mirrors `posts.visibility`'s
 * vocabulary minus `FOLLOWERS`, which has no meaning for a Page (there is no per-viewer
 * follow-gated rendering in v1). */
export const PAGE_VISIBILITIES = ['PUBLIC', 'UNLISTED'] as const;
export type PageVisibility = (typeof PAGE_VISIBILITIES)[number];

/** `posts.quote_policy` (`INITIAL_VISION.md` §189, Amendment B) — who may quote a post.
 * Re-checked server-side on every quoting `CreatePost` (§192), never inferred from the
 * client. Also the `claimed_policy` domain on `quote_authorizations` (ADR 0028): the
 * policy a stamp claims was in force, same three values, re-used rather than duplicated. */
export const QUOTE_POLICIES = ['ANYONE', 'FOLLOWERS', 'NOBODY'] as const;
export type QuotePolicy = (typeof QUOTE_POLICIES)[number];

/** `quote_authorizations.state` (ADR 0028, P18-002) — the FEP-044f authorization
 * lifecycle. `PENDING`: a `quoteAuthorization` stamp is referenced but not yet verified
 * (or a `QuoteRequest` is awaited); `VERIFIED`: the stamp was dereferenced and validated
 * (or our own author accepted the quote); `REVOKED`: the stamp was `Delete`d / the quoted
 * author withdrew approval — a state flip on the row, never a delete, because an
 * unapproved-after-revocation quote is still rendered, just not as endorsed (§193);
 * `REJECTED`: the quoted author answered `Reject(QuoteRequest)` — the quote exists but
 * was refused from the start. Mirrors `E2EE_EVIDENCE_VERIFICATION_STATUSES`' "fail to a
 * state, never to discarded" shape. */
export const QUOTE_AUTHORIZATION_STATES = ['PENDING', 'VERIFIED', 'REVOKED', 'REJECTED'] as const;
export type QuoteAuthorizationState = (typeof QUOTE_AUTHORIZATION_STATES)[number];

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

/** Immutable direct-message security boundary (ADR 0020). `E2EE_V1` is the only value: ADR
 * 0030 §B-095 removed the server-visible `LEGACY_SERVER_VISIBLE` mode (ADR 0017) — zero users
 * meant zero migration cost, so the value was dropped rather than carried forward. The
 * protobuf enum reserves its old number and name (`patches/v1/e2ee.proto`); this text-backed
 * CHECK constraint has no equivalent reservation concept, so it is simply narrowed. */
export const CONVERSATION_SECURITY_MODES = ['E2EE_V1'] as const;
export type ConversationSecurityMode = (typeof CONVERSATION_SECURITY_MODES)[number];

export const E2EE_EVIDENCE_VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'UNVERIFIABLE'] as const;
export type E2eeEvidenceVerificationStatus = (typeof E2EE_EVIDENCE_VERIFICATION_STATUSES)[number];

/** `e2ee_group_control_events.change_kind` (ADR 0020 §7, P13-008) — mirrors
 * `E2EE_GROUP_CHANGE_KINDS` in `@patches/domain`; the E2EE proto's `E2eeGroupChangeKind`
 * enum names these same values with a `E2EE_GROUP_CHANGE_KIND_` prefix. */
export const E2EE_GROUP_CHANGE_KINDS = ['ADDED', 'REMOVED'] as const;
export type E2eeGroupChangeKind = (typeof E2EE_GROUP_CHANGE_KINDS)[number];

/** `filters.action` / `filter_list_subscriptions.action` (`INITIAL_VISION.md` §198.3,
 * §199.2). What a matched filter (or a list-derived filter) does to a post. Also the base
 * of `LABEL_ACTIONS`, which adds `IGNORE` (§200.1) — kept as a separate array rather than
 * derived, since a label subscription action and a filter action are different columns with
 * different domains, even though three of the four values read the same. */
export const FILTER_ACTIONS = ['HIDE', 'COLLAPSE', 'WARN'] as const;
export type FilterAction = (typeof FILTER_ACTIONS)[number];

/** `filter_scopes.scope` (`INITIAL_VISION.md` §198.3). Threads and profiles are deliberately
 * absent — "a filter governs what arrives unbidden", not something a viewer opened on
 * purpose. */
export const FILTER_SCOPES = [
  'HOME',
  'LOCAL',
  'TAG_FEED',
  'COMMUNITY_FEED',
  'NOTIFICATIONS',
  'SEARCH',
  'MESSAGE_REQUESTS',
] as const;
export type FilterScope = (typeof FILTER_SCOPES)[number];

/** `filter_terms.kind` (`INITIAL_VISION.md` §198.2) — shared verbatim by
 * `filter_list_entries.kind` (§199.1: "the §198.2 kinds"), so both columns' `@Check`
 * constraints are generated from this one array. No regex kind exists in v1 (§198.2, §208) —
 * every kind here is a literal the server matches, never a user-supplied pattern. */
export const FILTER_TERM_KINDS = ['SUBSTRING', 'WORD', 'TAG', 'ACTOR', 'DOMAIN'] as const;
export type FilterTermKind = (typeof FILTER_TERM_KINDS)[number];

/** `labeler_subscription_actions.action` (`INITIAL_VISION.md` §200.1) — the §198.3 actions
 * plus `IGNORE`, since a subscriber may choose to ignore a labeler's value entirely (except a
 * node-mandatory value, enforced in the service layer, not here). */
export const LABEL_ACTIONS = ['IGNORE', 'WARN', 'COLLAPSE', 'HIDE'] as const;
export type LabelAction = (typeof LABEL_ACTIONS)[number];

/** `labels.subject_type` (`INITIAL_VISION.md` §202, "mirrors `reports`" — see
 * `report.entity.ts`'s `REPORT_SUBJECT_TYPES`, of which this is the two-member subset a label
 * can target). */
export const LABEL_SUBJECT_TYPES = ['ACTOR', 'POST'] as const;
export type LabelSubjectType = (typeof LABEL_SUBJECT_TYPES)[number];

/** `appeals.status` (`INITIAL_VISION.md` §201.3). */
export const APPEAL_STATUSES = ['OPEN', 'UPHELD', 'OVERTURNED', 'MODIFIED'] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

/** `moderation_log_entries.subject_kind` (`INITIAL_VISION.md` §201.4). Account/post/media
 * entries are anonymized by construction (no actor/post id column at all); a domain entry is
 * fully identified via `subject_domain`, since it is the node's own federation decision about
 * its own conduct, not a record of any individual's conduct. */
export const MODERATION_LOG_SUBJECT_KINDS = ['DOMAIN', 'ACCOUNT', 'POST', 'MEDIA'] as const;
export type ModerationLogSubjectKind = (typeof MODERATION_LOG_SUBJECT_KINDS)[number];

/** `moderation_log_entries.action` (`INITIAL_VISION.md` §201.2/§201.4-5) — the node
 * enforcement actions that generate a moderation notice, plus the domain-level action
 * published in the moderation log. Mirrors `ModerationActionType` in `moderation.proto`. */
export const MODERATION_ACTION_TYPES = [
  'WARN',
  'SUSPEND',
  'BAN',
  'POST_REMOVAL',
  'MEDIA_TAKEDOWN',
  'DOMAIN_BLOCK',
] as const;
export type ModerationActionType = (typeof MODERATION_ACTION_TYPES)[number];

/** `moderation_log_entries.reason_category` / `domain_blocks.reason_category`
 * (`INITIAL_VISION.md` §202, `MODERATION_LOG_REASON_CATEGORIES`) — a bounded vocabulary
 * derived from `docs/product/moderation.md`'s guideline list, never a report's free-text
 * `details` and never a moderator's internal note. Mirrors `ModerationReasonCategory` in
 * `moderation.proto`. Shared by both columns because §201.5 states the published domain-block
 * reason is "the bounded category, same split as §201.4" — one vocabulary, two call sites. */
export const MODERATION_REASON_CATEGORIES = [
  'HARASSMENT',
  'HATE',
  'THREATS',
  'DOXXING',
  'IMPERSONATION',
  'SPAM',
  'ILLEGAL_CONTENT',
  'NCII',
  'INFRASTRUCTURE_ABUSE',
  'OTHER',
] as const;
export type ModerationReasonCategory = (typeof MODERATION_REASON_CATEGORIES)[number];

/** `domain_blocks.source` (`INITIAL_VISION.md` §201.6) — `IMPORTED` records provenance only;
 * an imported blocklist is a reference list for an operator to review, never a write path of
 * its own (`patches-admin domain block` remains the only writer either way). */
export const DOMAIN_BLOCK_SOURCES = ['MANUAL', 'IMPORTED'] as const;
export type DomainBlockSource = (typeof DOMAIN_BLOCK_SOURCES)[number];

/** `account_exports.status` (`INITIAL_VISION.md` §197.3, §204 — one ready archive at a time,
 * expires after 7 days). */
export const ACCOUNT_EXPORT_STATUSES = ['PENDING', 'READY', 'FAILED', 'EXPIRED'] as const;
export type AccountExportStatus = (typeof ACCOUNT_EXPORT_STATUSES)[number];

/**
 * Builds `"column" IN ('A', 'B')` for a `@Check(...)` expression from a value list, so the
 * TS union and the database constraint are generated from the same array. Values are
 * compile-time string literals from this module only — never user input — so the simple
 * quoting here is safe.
 */
export function checkIn(columnName: string, values: readonly string[]): string {
  return `"${columnName}" IN (${values.map((value) => `'${value}'`).join(', ')})`;
}
