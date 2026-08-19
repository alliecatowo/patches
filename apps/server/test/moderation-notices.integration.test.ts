import { credentials as grpcCredentials } from '@grpc/grpc-js';
import {
  createAppealClient,
  createAuthClient,
  createModerationClient,
  createNotificationClient,
  type AppealGrpcClient,
  type AuthGrpcClient,
  type CreateAppealRequest,
  type CreateAppealResponse,
  type GetUnreadCountRequest,
  type GetUnreadCountResponse,
  type ListMyModerationNoticesRequest,
  type ListMyModerationNoticesResponse,
  type ListNotificationsRequest,
  type ListNotificationsResponse,
  type ModerationGrpcClient,
  type NotificationGrpcClient,
} from '@patches/proto';
import { ModerationActionType, NotificationType } from '@patches/proto/nest';
import { Actor, appendAdminAuditLog, Appeal, Notification, User } from '@patches/database';
import { createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { registerTestActor, testSuffix, type TestActor } from './support/fixtures.js';
import { callUnary, startTestServer, type TestServer } from './support/test-server.js';

/**
 * A-049/A-050 (spec §201.2–§201.3): every node enforcement action MUST *deliver* a
 * `MODERATION`-type notification, not just leave a pull-only `ListMyModerationNotices`
 * projection nobody is ever told to go look at. This suite exercises the write path the admin
 * CLI now performs — `apps/admin/src/commands/{user,report,appeal}.ts`'s
 * `writeModerationNotification` helper, this task's owned file — directly against the same
 * tables it writes, the same way `appeals.integration.test.ts` (this task's sibling file)
 * simulates admin CLI writes rather than shelling out to the CLI binary.
 *
 * `ListNotifications`/`GetUnreadCount` sit behind the plain `AuthGuard`, which rejects a
 * `SUSPENDED` account outright (P6-004) — so, to exercise them over real gRPC after a suspend,
 * these tests unsuspend the actor first (mirroring `patches-admin user unsuspend`, out of this
 * task's notification-writing scope: reversing an enforcement action is not itself one, spec
 * §201.2's list). `ListMyModerationNotices`/`AppealService` use `SuspensionTolerantAuthGuard`
 * instead and stay reachable throughout, which this suite also exercises directly.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping moderation-notices integration tests: TEST_DATABASE_URL is not ' +
      'set (start Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'MODERATION notifications delivered on enforcement (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let moderation: ModerationGrpcClient;
    let notifications: NotificationGrpcClient;
    let appeals: AppealGrpcClient;
    let inviterUserId: string;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `inviter${testSuffix()}`,
      });
      inviterUserId = user.id;

      server = await startTestServer();
      auth = createAuthClient(server.url, grpcCredentials.createInsecure());
      moderation = createModerationClient(server.url, grpcCredentials.createInsecure());
      notifications = createNotificationClient(server.url, grpcCredentials.createInsecure());
      appeals = createAppealClient(server.url, grpcCredentials.createInsecure());
    }, 60_000);

    afterAll(async () => {
      auth.close();
      moderation.close();
      notifications.close();
      appeals.close();
      await server.close();
      await dataSource.destroy();
    });

    async function newActor(): Promise<TestActor> {
      return registerTestActor(auth, dataSource, inviterUserId);
    }

    async function userIdForActor(actorId: string): Promise<string> {
      const actor = await dataSource.getRepository(Actor).findOneOrFail({ where: { id: actorId } });
      if (actor.userId === null) throw new Error('actor has no local user');
      return actor.userId;
    }

    /** Mirrors `patches-admin user suspend <handle> --reason <text>` end to end, including its
     * `writeModerationNotification` call — the same table writes, in the same order, as the
     * real command (`apps/admin/src/commands/user.ts`'s `suspendUser`, outside this file's
     * scope but exactly what this simulates). */
    async function suspendActor(actorId: string, reason: string): Promise<string> {
      const userId = await userIdForActor(actorId);
      return dataSource.transaction(async (manager) => {
        await manager.getRepository(User).update({ id: userId }, { status: 'SUSPENDED' });
        const auditLog = await appendAdminAuditLog(manager, {
          adminUserId: inviterUserId,
          action: 'user.suspend',
          subjectType: 'USER',
          subjectId: userId,
          metadata: { reason },
        });
        await manager.getRepository(Notification).save(
          manager.getRepository(Notification).create({
            recipientActorId: actorId,
            type: 'MODERATION',
            actorId: null,
            postId: null,
            conversationId: null,
            communityId: null,
          }),
        );
        return auditLog.id;
      });
    }

    /** Mirrors `patches-admin user unsuspend <handle>` — no `MODERATION` notification of its
     * own (a reversal is not an enforcement action, spec §201.2's list), just the status flip,
     * so the actor's already-issued access token authenticates against `AuthGuard` again. */
    async function unsuspendActor(actorId: string): Promise<void> {
      const userId = await userIdForActor(actorId);
      await dataSource.getRepository(User).update({ id: userId }, { status: 'ACTIVE' });
    }

    /** Mirrors `patches-admin appeal resolve <id> --outcome <o> --reason <text>`, including its
     * `writeModerationNotification` call (`apps/admin/src/commands/appeal.ts`'s
     * `resolveAppeal`). */
    async function resolveAppeal(
      appealId: string,
      appellantActorId: string,
      outcome: 'upheld' | 'overturned' | 'modified',
      reason: string,
    ): Promise<void> {
      const appellantUserId = await userIdForActor(appellantActorId);
      await dataSource.transaction(async (manager) => {
        const appeal = await manager
          .getRepository(Appeal)
          .findOneOrFail({ where: { id: appealId } });
        const status =
          outcome === 'overturned' ? 'OVERTURNED' : outcome === 'modified' ? 'MODIFIED' : 'UPHELD';
        await manager.getRepository(Appeal).update(
          { id: appealId },
          {
            status,
            resolvedAt: new Date(),
            resolvedByUserId: inviterUserId,
            resolutionReason: reason,
          },
        );
        await appendAdminAuditLog(manager, {
          adminUserId: inviterUserId,
          action: 'appeal.resolve',
          subjectType: 'USER',
          subjectId: appellantUserId,
          metadata: {
            appealId,
            moderationNoticeId: appeal.adminAuditLogId,
            outcome,
            reason,
          },
        });
        await manager.getRepository(Notification).save(
          manager.getRepository(Notification).create({
            recipientActorId: appellantActorId,
            type: 'MODERATION',
            actorId: null,
            postId: null,
            conversationId: null,
            communityId: null,
          }),
        );
      });
    }

    async function myNotices(actor: TestActor): Promise<ListMyModerationNoticesResponse> {
      return callUnary<ListMyModerationNoticesRequest, ListMyModerationNoticesResponse>(
        moderation.listMyModerationNotices.bind(moderation),
        { cursor: '', limit: 20 },
        { accessToken: actor.accessToken },
      );
    }

    async function myNotifications(actor: TestActor): Promise<ListNotificationsResponse> {
      return callUnary<ListNotificationsRequest, ListNotificationsResponse>(
        notifications.listNotifications.bind(notifications),
        { cursor: '', limit: 20 },
        { accessToken: actor.accessToken },
      );
    }

    it('delivers a MODERATION notification on suspend, alongside the ListMyModerationNotices entry', async () => {
      const subject = await newActor();
      await suspendActor(subject.actorId, 'repeated spam');

      // `ListMyModerationNotices` uses `SuspensionTolerantAuthGuard` — reachable while still
      // suspended, which is exactly when the actor most needs it.
      const notices = await myNotices(subject);
      const notice = notices.notices.find(
        (n) => n.action === ModerationActionType.MODERATION_ACTION_TYPE_SUSPEND,
      );
      expect(notice).toBeDefined();

      // `ListNotifications` sits behind the plain `AuthGuard`, which rejects `SUSPENDED` — the
      // same token works again once the account is unsuspended.
      await unsuspendActor(subject.actorId);
      const notifs = await myNotifications(subject);
      const moderationNotif = notifs.notifications.find(
        (n) => n.type === NotificationType.NOTIFICATION_TYPE_MODERATION,
      );
      expect(moderationNotif).toBeDefined();
      expect(moderationNotif?.readAt ?? undefined).toBeUndefined();

      // The notification carries no actor/post/conversation/community reference and no text of
      // its own — it is a bell, not a second copy of the notice (spec §201.2's "read
      // projection ... not a second source of truth").
      expect(moderationNotif?.actor ?? undefined).toBeUndefined();
      expect(moderationNotif?.postId ?? '').toBe('');
      expect(moderationNotif?.conversationId ?? '').toBe('');
      expect(moderationNotif?.communityId ?? '').toBe('');

      const unread = await callUnary<GetUnreadCountRequest, GetUnreadCountResponse>(
        notifications.getUnreadCount.bind(notifications),
        {},
        { accessToken: subject.accessToken },
      );
      expect(unread.count).toBeGreaterThanOrEqual(1);

      // No moderator identity anywhere in either response — neither the operator's id nor
      // anything that could point back at the reviewing admin appears in the JSON the actor
      // receives.
      expect(JSON.stringify(notices)).not.toContain(inviterUserId);
      expect(JSON.stringify(notifs)).not.toContain(inviterUserId);
    });

    it('delivers a MODERATION notification on appeal resolution, distinct from the original enforcement notice', async () => {
      const subject = await newActor();
      const auditLogId = await suspendActor(subject.actorId, 'appeal-flow reason');
      await unsuspendActor(subject.actorId);

      const created = await callUnary<CreateAppealRequest, CreateAppealResponse>(
        appeals.createAppeal.bind(appeals),
        { moderationNoticeId: auditLogId, statement: 'I was not spamming.' },
        { accessToken: subject.accessToken },
      );
      const appealId = created.appeal?.id ?? '';
      expect(appealId).not.toBe('');

      await resolveAppeal(appealId, subject.actorId, 'overturned', 'Evidence did not support it.');

      const notices = await myNotices(subject);
      expect(notices.notices.length).toBeGreaterThanOrEqual(2);
      const suspendNotice = notices.notices.find((n) => n.id === auditLogId);
      expect(suspendNotice).toBeDefined();
      const appealNotice = notices.notices.find((n) => n.id !== auditLogId);
      expect(appealNotice).toBeDefined();
      // The appeal-resolution notice describes the *original* enforcement action (there is no
      // dedicated `ModerationActionType` for "appeal resolved") — carrying the outcome and
      // `appeals.resolution_reason` in its explanation, never `reports.moderator_note`.
      expect(appealNotice?.action).toBe(ModerationActionType.MODERATION_ACTION_TYPE_SUSPEND);
      expect(appealNotice?.explanation).toContain('overturned');
      expect(appealNotice?.explanation).toContain('Evidence did not support it.');
      // Not itself appealable — no fresh appeal window on an appeal outcome.
      expect(appealNotice?.appealDeadline ?? undefined).toBeUndefined();

      const notifs = await myNotifications(subject);
      const moderationNotifs = notifs.notifications.filter(
        (n) => n.type === NotificationType.NOTIFICATION_TYPE_MODERATION,
      );
      expect(moderationNotifs.length).toBeGreaterThanOrEqual(2);

      expect(JSON.stringify(notices)).not.toContain(inviterUserId);
      expect(JSON.stringify(notifs)).not.toContain(inviterUserId);
    });
  },
);
