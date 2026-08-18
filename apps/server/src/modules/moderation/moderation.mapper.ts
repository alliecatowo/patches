import type { ReportReason as DbReportReason } from '@patches/database';
import { ReportReason } from '@patches/proto/nest';

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
