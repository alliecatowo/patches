import {
  MODERATION_REASON_CATEGORIES,
  type ModerationActionType as DbModerationActionType,
  type ModerationLogSubjectKind as DbModerationLogSubjectKind,
  type ModerationReasonCategory as DbModerationReasonCategory,
  type ReportReason as DbReportReason,
} from '@patches/database';
import {
  ModerationActionType,
  ModerationLogSubjectKind,
  ModerationReasonCategory,
  ReportReason,
} from '@patches/proto/nest';

/** Application DTO → protobuf enum / protobuf → application DTO (spec §128). */

const REASON_TO_PROTO: Readonly<Record<DbReportReason, ReportReason>> = Object.freeze({
  SPAM: ReportReason.REPORT_REASON_SPAM,
  HARASSMENT: ReportReason.REPORT_REASON_HARASSMENT,
  HATE_SPEECH: ReportReason.REPORT_REASON_HATE_SPEECH,
  ILLEGAL_CONTENT: ReportReason.REPORT_REASON_ILLEGAL_CONTENT,
  IMPERSONATION: ReportReason.REPORT_REASON_IMPERSONATION,
  OTHER: ReportReason.REPORT_REASON_OTHER,
});

const PROTO_TO_REASON: Readonly<Partial<Record<ReportReason, DbReportReason>>> = Object.freeze({
  [ReportReason.REPORT_REASON_SPAM]: 'SPAM',
  [ReportReason.REPORT_REASON_HARASSMENT]: 'HARASSMENT',
  [ReportReason.REPORT_REASON_HATE_SPEECH]: 'HATE_SPEECH',
  [ReportReason.REPORT_REASON_ILLEGAL_CONTENT]: 'ILLEGAL_CONTENT',
  [ReportReason.REPORT_REASON_IMPERSONATION]: 'IMPERSONATION',
  [ReportReason.REPORT_REASON_OTHER]: 'OTHER',
});

export function toProtoReportReason(value: DbReportReason): ReportReason {
  return REASON_TO_PROTO[value];
}

/** `REPORT_REASON_UNSPECIFIED` (an unset request field) defaults to `OTHER` — there is no
 * "no reason" report in the database enum, and defaulting rather than rejecting keeps
 * `ReportPost`/`ReportActor` usable from a minimal client that only sends free-text
 * `details`. */
export function reportReasonFromProto(value: ReportReason): DbReportReason {
  return PROTO_TO_REASON[value] ?? 'OTHER';
}

/** `moderation_log_entries.reason_category` / a moderation notice's `reason_category` (spec
 * §201.2, §201.4, §202) — the bounded vocabulary shared by both, never a report's free-text
 * `details` or a moderator's internal note. */
const REASON_CATEGORY_TO_PROTO: Readonly<
  Record<DbModerationReasonCategory, ModerationReasonCategory>
> = Object.freeze({
  HARASSMENT: ModerationReasonCategory.MODERATION_REASON_CATEGORY_HARASSMENT,
  HATE: ModerationReasonCategory.MODERATION_REASON_CATEGORY_HATE,
  THREATS: ModerationReasonCategory.MODERATION_REASON_CATEGORY_THREATS,
  DOXXING: ModerationReasonCategory.MODERATION_REASON_CATEGORY_DOXXING,
  IMPERSONATION: ModerationReasonCategory.MODERATION_REASON_CATEGORY_IMPERSONATION,
  SPAM: ModerationReasonCategory.MODERATION_REASON_CATEGORY_SPAM,
  ILLEGAL_CONTENT: ModerationReasonCategory.MODERATION_REASON_CATEGORY_ILLEGAL_CONTENT,
  NCII: ModerationReasonCategory.MODERATION_REASON_CATEGORY_NCII,
  INFRASTRUCTURE_ABUSE: ModerationReasonCategory.MODERATION_REASON_CATEGORY_INFRASTRUCTURE_ABUSE,
  OTHER: ModerationReasonCategory.MODERATION_REASON_CATEGORY_OTHER,
});

export function toProtoReasonCategory(value: DbModerationReasonCategory): ModerationReasonCategory {
  return REASON_CATEGORY_TO_PROTO[value];
}

/** Parses an admin-CLI-supplied reason category string (`--reason-category`, or an
 * `admin_audit_log.metadata.reasonCategory` value read back by the notice projection) against
 * the closed vocabulary — anything else, including unset, defaults to `OTHER` rather than
 * rejecting (the operator's free-text `reason` always carries the detail; the category is a
 * best-effort bucket, spec §201.5). */
export function moderationReasonCategoryFromInput(value: unknown): DbModerationReasonCategory {
  if (typeof value !== 'string') return 'OTHER';
  const upper = value.trim().toUpperCase();
  return (MODERATION_REASON_CATEGORIES as readonly string[]).includes(upper)
    ? (upper as DbModerationReasonCategory)
    : 'OTHER';
}

const ACTION_TYPE_TO_PROTO: Readonly<Record<DbModerationActionType, ModerationActionType>> =
  Object.freeze({
    WARN: ModerationActionType.MODERATION_ACTION_TYPE_WARN,
    SUSPEND: ModerationActionType.MODERATION_ACTION_TYPE_SUSPEND,
    BAN: ModerationActionType.MODERATION_ACTION_TYPE_BAN,
    POST_REMOVAL: ModerationActionType.MODERATION_ACTION_TYPE_POST_REMOVAL,
    MEDIA_TAKEDOWN: ModerationActionType.MODERATION_ACTION_TYPE_MEDIA_TAKEDOWN,
    DOMAIN_BLOCK: ModerationActionType.MODERATION_ACTION_TYPE_DOMAIN_BLOCK,
  });

export function toProtoActionType(value: DbModerationActionType): ModerationActionType {
  return ACTION_TYPE_TO_PROTO[value];
}

const SUBJECT_KIND_TO_PROTO: Readonly<
  Record<DbModerationLogSubjectKind, ModerationLogSubjectKind>
> = Object.freeze({
  DOMAIN: ModerationLogSubjectKind.MODERATION_LOG_SUBJECT_KIND_DOMAIN,
  ACCOUNT: ModerationLogSubjectKind.MODERATION_LOG_SUBJECT_KIND_ACCOUNT,
  POST: ModerationLogSubjectKind.MODERATION_LOG_SUBJECT_KIND_POST,
  MEDIA: ModerationLogSubjectKind.MODERATION_LOG_SUBJECT_KIND_MEDIA,
});

export function toProtoSubjectKind(value: DbModerationLogSubjectKind): ModerationLogSubjectKind {
  return SUBJECT_KIND_TO_PROTO[value];
}
