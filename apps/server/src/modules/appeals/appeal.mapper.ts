import { type Appeal as DbAppeal, type AppealStatus as DbAppealStatus } from '@patches/database';
import { dateToTimestamp } from '@patches/proto';
import { AppealStatus, type Appeal } from '@patches/proto/nest';

/** Application DTO → protobuf enum / protobuf → application DTO (spec §128). */

const STATUS_TO_PROTO: Readonly<Record<DbAppealStatus, AppealStatus>> = Object.freeze({
  OPEN: AppealStatus.APPEAL_STATUS_OPEN,
  UPHELD: AppealStatus.APPEAL_STATUS_UPHELD,
  OVERTURNED: AppealStatus.APPEAL_STATUS_OVERTURNED,
  MODIFIED: AppealStatus.APPEAL_STATUS_MODIFIED,
});

/** Never returns a `DbAppeal` (a TypeORM entity) itself — this is the boundary spec §153
 * requires (`packages/database` entities never cross the controller). `moderation_notice_id`
 * is `adminAuditLogId` — the appeal points at the same `admin_audit_log` row a `ModerationNotice`
 * projects from (`Appeal.entity.ts`'s doc comment, `notice-projection.ts`). */
export function toProtoAppeal(row: DbAppeal): Appeal {
  return {
    id: row.id,
    moderationNoticeId: row.adminAuditLogId,
    statement: row.statement,
    status: STATUS_TO_PROTO[row.status],
    createdAt: dateToTimestamp(row.createdAt),
    resolvedAt: row.resolvedAt === null ? undefined : dateToTimestamp(row.resolvedAt),
    resolutionReason: row.resolutionReason ?? '',
  };
}
