import { dateToTimestamp } from '@patches/proto';
import { ModerationActionType, type ModerationNotice } from '@patches/proto/nest';
import type { DataSource, EntityManager } from 'typeorm';

import { moderationReasonCategoryFromInput, toProtoReasonCategory } from './moderation.mapper.js';

/**
 * `ListMyModerationNotices`/`AppealService.CreateAppeal`'s shared read side (spec §201.2): "the
 * notice is a read projection of the `admin_audit_log` row, not a second source of truth" — so
 * there is no `moderation_notices` table. This file is the single place that decides which
 * `admin_audit_log` rows are notice-worthy and how they map to a `ModerationNotice`, reused by
 * both `ModerationService` (list) and `AppealService` (single-row lookup by id, since an
 * appeal's `moderation_notice_id` literally *is* the `admin_audit_log.id` — `Appeal.entity.ts`'s
 * doc comment).
 *
 * Only two write paths in this task's owned file set produce notice-worthy rows today:
 * `patches-admin user suspend|delete` (subject_type `USER`, action `user.suspend`/`user.delete`)
 * and `patches-admin report resolve --action remove-post|suspend` (subject_type `REPORT`,
 * action `report.resolve`) — both already existed before this task (P6-003) and are outside
 * this task's owned file set (`apps/admin/src/commands/{user,report}.ts`), so nothing there
 * changed; this only reads what they already write. `WARN`/`MEDIA_TAKEDOWN` have no admin
 * command producing them yet — an honest gap, not a schema gap (spec §176).
 *
 * For a `report.resolve` row, the explanation is deliberately **not** `metadata.note` — that
 * value is the same free text `report.resolve` also writes into `reports.moderator_note`
 * (§55's "no user-facing RPC exposes an internal moderator note", restated by §201.2 as
 * "the notice's explanation ... is not `reports.moderator_note`"). A generic, category-derived
 * sentence is used instead; `user.suspend`/`user.delete`'s `metadata.reason` has no such
 * provenance (it never touches `reports`), so it is safe to surface directly.
 */

export interface NoticeRow {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  reportPostId: string | null;
  appealed: boolean;
}

const NOTICE_LIST_QUERY = `
  SELECT combined.id, combined.action, combined.metadata, combined.created_at AS "createdAt",
         combined.report_post_id AS "reportPostId",
         (ap.id IS NOT NULL) AS appealed
  FROM (
    SELECT aal.id, aal.action, aal.metadata, aal.created_at, NULL::uuid AS report_post_id
    FROM admin_audit_log aal
    INNER JOIN actors a ON a.user_id = aal.subject_id::uuid
    WHERE aal.subject_type = 'USER' AND a.id = $1
      AND aal.action IN ('user.suspend', 'user.delete')
    UNION ALL
    SELECT aal.id, aal.action, aal.metadata, aal.created_at, r.subject_post_id AS report_post_id
    FROM admin_audit_log aal
    INNER JOIN reports r ON r.id = aal.subject_id::uuid
    LEFT JOIN posts p ON p.id = r.subject_post_id
    WHERE aal.subject_type = 'REPORT' AND aal.action = 'report.resolve'
      AND (r.subject_actor_id = $1 OR p.author_actor_id = $1)
  ) combined
  LEFT JOIN appeals ap ON ap.admin_audit_log_id = combined.id
  WHERE ($2::timestamptz IS NULL OR (combined.created_at, combined.id) < ($2::timestamptz, $3::uuid))
  ORDER BY combined.created_at DESC, combined.id DESC
  LIMIT $4
`;

/** One page of the caller's own notice-worthy `admin_audit_log` rows, newest first. */
export async function queryNoticeRows(
  dataSource: DataSource,
  actorId: string,
  cursor: { createdAt: Date; id: string } | undefined,
  take: number,
): Promise<NoticeRow[]> {
  const rows = await dataSource.query<NoticeRow[]>(NOTICE_LIST_QUERY, [
    actorId,
    cursor?.createdAt ?? null,
    cursor?.id ?? null,
    take,
  ]);
  return rows;
}

const NOTICE_BY_ID_QUERY = `
  SELECT aal.id, aal.action, aal.metadata, aal.created_at AS "createdAt",
         CASE WHEN aal.subject_type = 'REPORT' THEN r.subject_post_id ELSE NULL END AS "reportPostId",
         (ap.id IS NOT NULL) AS appealed
  FROM admin_audit_log aal
  LEFT JOIN reports r ON aal.subject_type = 'REPORT' AND r.id = aal.subject_id::uuid
  LEFT JOIN posts p ON p.id = r.subject_post_id
  LEFT JOIN actors a ON aal.subject_type = 'USER' AND a.user_id = aal.subject_id::uuid
  LEFT JOIN appeals ap ON ap.admin_audit_log_id = aal.id
  WHERE aal.id = $1
    AND (
      (aal.subject_type = 'USER' AND aal.action IN ('user.suspend', 'user.delete') AND a.id = $2)
      OR (aal.subject_type = 'REPORT' AND aal.action = 'report.resolve'
          AND (r.subject_actor_id = $2 OR p.author_actor_id = $2))
    )
`;

/** A single notice-worthy row by `admin_audit_log.id`, scoped to the acted-upon actor — `null`
 * for both "no such row" and "that row concerns someone else" (spec §62/§64's no-oracle rule,
 * applied here the same way `PostService.getPost` already applies it). Takes the caller's own
 * transactional `EntityManager` so `AppealService.createAppeal` can look this up and insert the
 * `appeals` row in one transaction. */
export async function findNoticeRow(
  manager: EntityManager,
  actorId: string,
  auditLogId: string,
): Promise<NoticeRow | null> {
  const rows = await manager.query<NoticeRow[]>(NOTICE_BY_ID_QUERY, [auditLogId, actorId]);
  return rows[0] ?? null;
}

/** `row.createdAt + windowDays` — the appeal deadline `AppealService.CreateAppeal`'s window
 * check and `ModerationNotice.appeal_deadline` both derive from the same row. */
export function appealDeadlineFor(row: NoticeRow, windowDays: number): Date {
  return new Date(row.createdAt.getTime() + windowDays * 24 * 60 * 60_000);
}

/** Maps a notice-worthy `admin_audit_log` row to the `ModerationNotice` the caller sees (spec
 * §201.2). See this file's class doc for why `report.resolve`'s explanation is synthesized
 * rather than read from `metadata.note`. */
export function toModerationNotice(row: NoticeRow, appealWindowDays: number): ModerationNotice {
  const metadata = row.metadata ?? {};
  let action: ModerationActionType;
  let postId = '';
  let explanation: string;

  if (row.action === 'user.suspend') {
    action = ModerationActionType.MODERATION_ACTION_TYPE_SUSPEND;
    explanation = readReasonText(metadata);
  } else if (row.action === 'user.delete') {
    action = ModerationActionType.MODERATION_ACTION_TYPE_BAN;
    explanation = readReasonText(metadata);
  } else {
    // 'report.resolve'
    const resolveAction = metadata.resolveAction;
    if (resolveAction === 'remove-post') {
      action = ModerationActionType.MODERATION_ACTION_TYPE_POST_REMOVAL;
      postId = row.reportPostId ?? '';
      explanation = "Your post was removed for violating this node's guidelines.";
    } else {
      action = ModerationActionType.MODERATION_ACTION_TYPE_SUSPEND;
      explanation = "Your account was suspended for violating this node's guidelines.";
    }
  }

  const reasonCategory = toProtoReasonCategory(
    moderationReasonCategoryFromInput(metadata.reasonCategory),
  );
  const deadline = appealDeadlineFor(row, appealWindowDays);
  const appealDeadline = deadline.getTime() > Date.now() ? dateToTimestamp(deadline) : undefined;

  return {
    id: row.id,
    action,
    postId,
    reasonCategory,
    explanation,
    createdAt: dateToTimestamp(row.createdAt),
    appealDeadline,
    appealed: row.appealed,
  };
}

function readReasonText(metadata: Record<string, unknown>): string {
  return typeof metadata.reason === 'string' ? metadata.reason : '';
}
