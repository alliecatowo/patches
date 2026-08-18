import { Bookmark, Like, Notification, Report } from '@patches/database';
import type { NotificationType, ReportReason, ReportSubjectType } from '@patches/database';
import type { EntityManager } from 'typeorm';

/**
 * Phase 4/6 interaction fixtures (`INITIAL_VISION.md` §53, §56, §64) — same shape as
 * `social-graph.ts`'s factories: caller-supplied `EntityManager`, so fixtures roll back with
 * `withTransactionRollback`.
 */

export interface CreateTestLikeOptions {
  actorId: string;
  postId: string;
  createdAt?: Date;
}

export async function createTestLike(
  manager: EntityManager,
  options: CreateTestLikeOptions,
): Promise<Like> {
  const likes = manager.getRepository(Like);
  return likes.save(
    likes.create({
      actorId: options.actorId,
      postId: options.postId,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestBookmarkOptions {
  actorId: string;
  postId: string;
  createdAt?: Date;
}

export async function createTestBookmark(
  manager: EntityManager,
  options: CreateTestBookmarkOptions,
): Promise<Bookmark> {
  const bookmarks = manager.getRepository(Bookmark);
  return bookmarks.save(
    bookmarks.create({
      actorId: options.actorId,
      postId: options.postId,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestNotificationOptions {
  recipientActorId: string;
  type: NotificationType;
  actorId?: string | null;
  postId?: string | null;
  readAt?: Date | null;
  createdAt?: Date;
}

export async function createTestNotification(
  manager: EntityManager,
  options: CreateTestNotificationOptions,
): Promise<Notification> {
  const notifications = manager.getRepository(Notification);
  return notifications.save(
    notifications.create({
      recipientActorId: options.recipientActorId,
      type: options.type,
      actorId: options.actorId ?? null,
      postId: options.postId ?? null,
      readAt: options.readAt ?? null,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestReportOptions {
  reporterActorId: string;
  subjectType: ReportSubjectType;
  subjectActorId?: string | null;
  subjectPostId?: string | null;
  /** For `subjectType: 'GUESTBOOK_ENTRY'` (P45-003, `INITIAL_VISION.md` §64, §172). */
  subjectGuestbookEntryId?: string | null;
  reason?: ReportReason;
  details?: string | null;
}

export async function createTestReport(
  manager: EntityManager,
  options: CreateTestReportOptions,
): Promise<Report> {
  const reports = manager.getRepository(Report);
  return reports.save(
    reports.create({
      reporterActorId: options.reporterActorId,
      subjectType: options.subjectType,
      subjectActorId: options.subjectActorId ?? null,
      subjectPostId: options.subjectPostId ?? null,
      subjectGuestbookEntryId: options.subjectGuestbookEntryId ?? null,
      reason: options.reason ?? 'SPAM',
      details: options.details ?? null,
    }),
  );
}
