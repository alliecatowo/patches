import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAppealClient,
  createAuthClient,
  createModerationClient,
  createPostClient,
  ERROR_CODE_METADATA_KEY,
  type AppealGrpcClient,
  type AuthGrpcClient,
  type CreateAppealRequest,
  type CreateAppealResponse,
  type CreatePostRequest,
  type CreatePostResponse,
  type GetAppealRequest,
  type GetAppealResponse,
  type ListMyAppealsRequest,
  type ListMyAppealsResponse,
  type ListMyModerationNoticesRequest,
  type ListMyModerationNoticesResponse,
  type ModerationGrpcClient,
  type PostGrpcClient,
} from '@patches/proto';
import {
  AppealStatus,
  ModerationActionType,
  ModerationReasonCategory,
  PostVisibility,
  QuotePolicy,
} from '@patches/proto/nest';
import {
  AccountDeletionRequest,
  Actor,
  appendAdminAuditLog,
  Post,
  Report,
  User,
  type AdminAuditLog,
} from '@patches/database';
import { createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { registerTestActor, testSuffix, type TestActor } from './support/fixtures.js';
import {
  callUnary,
  expectRejection,
  startTestServer,
  type TestServer,
} from './support/test-server.js';

/**
 * `ModerationService.ListMyModerationNotices` + `AppealService` end-to-end over real gRPC
 * against real PostgreSQL (spec §201.2, §201.3). Admin enforcement actions are simulated the
 * same way this suite's sibling files simulate admin CLI writes — directly against
 * `admin_audit_log`/`users`/`reports`/`posts` in a transaction, mirroring exactly what
 * `patches-admin user suspend`/`report resolve --action remove-post` (outside this task's file
 * scope) already write — rather than shelling out to the CLI binary.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping appeals integration tests: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'moderation notices + appeals over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let posts: PostGrpcClient;
    let moderation: ModerationGrpcClient;
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
      posts = createPostClient(server.url, grpcCredentials.createInsecure());
      moderation = createModerationClient(server.url, grpcCredentials.createInsecure());
      appeals = createAppealClient(server.url, grpcCredentials.createInsecure());
    }, 60_000);

    afterAll(async () => {
      auth.close();
      posts.close();
      moderation.close();
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

    /** Mirrors `patches-admin user suspend <handle> --reason <text>` (`apps/admin/src/
     * commands/user.ts`, outside this task's scope) exactly — same table writes, same
     * `admin_audit_log` shape. */
    async function suspendActor(actorId: string, reason: string): Promise<AdminAuditLog> {
      const userId = await userIdForActor(actorId);
      return dataSource.transaction(async (manager) => {
        await manager.getRepository(User).update({ id: userId }, { status: 'SUSPENDED' });
        return appendAdminAuditLog(manager, {
          adminUserId: inviterUserId,
          action: 'user.suspend',
          subjectType: 'USER',
          subjectId: userId,
          metadata: { reason },
        });
      });
    }

    /** Mirrors `patches-admin report resolve <id> --action remove-post --note <text>`
     * (`apps/admin/src/commands/report.ts`, outside this task's scope): removes the post and
     * writes the same `report.resolve` / `resolveAction: 'remove-post'` shape, with `note`
     * landing in both `reports.moderator_note` and `admin_audit_log.metadata` exactly as that
     * command does today. */
    async function resolveReportRemovePost(
      reportId: string,
      postId: string,
      note: string,
    ): Promise<AdminAuditLog> {
      return dataSource.transaction(async (manager) => {
        await manager
          .getRepository(Post)
          .update(
            { id: postId },
            { deletedAt: new Date(), removedByUserId: inviterUserId, removalReason: note },
          );
        await manager.getRepository(Report).update(
          { id: reportId },
          {
            status: 'RESOLVED',
            resolvedAt: new Date(),
            resolvedByUserId: inviterUserId,
            moderatorNote: note,
          },
        );
        return appendAdminAuditLog(manager, {
          adminUserId: inviterUserId,
          action: 'report.resolve',
          subjectType: 'REPORT',
          subjectId: reportId,
          metadata: { resolveAction: 'remove-post', note },
        });
      });
    }

    async function createPost(author: TestActor, body: string): Promise<string> {
      const response = await callUnary<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        {
          clientRequestId: randomUUID(),
          body,
          linkUrl: '',
          visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
          contentWarning: '',
          inReplyToId: '',
          mediaIds: [],
          quotedPostId: '',
          communityId: '',
          quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
        },
        { accessToken: author.accessToken },
      );
      return response.post?.id ?? '';
    }

    async function myNotices(actor: TestActor): Promise<ListMyModerationNoticesResponse> {
      return callUnary<ListMyModerationNoticesRequest, ListMyModerationNoticesResponse>(
        moderation.listMyModerationNotices.bind(moderation),
        { cursor: '', limit: 20 },
        { accessToken: actor.accessToken },
      );
    }

    describe('ListMyModerationNotices', () => {
      it('projects a user.suspend admin_audit_log row into a SUSPEND notice for the acted-upon actor only', async () => {
        const subject = await newActor();
        const bystander = await newActor();
        await suspendActor(subject.actorId, 'repeated spam');

        const subjectNotices = await myNotices(subject);
        const notice = subjectNotices.notices.find(
          (n) => n.action === ModerationActionType.MODERATION_ACTION_TYPE_SUSPEND,
        );
        expect(notice).toBeDefined();
        expect(notice?.explanation).toBe('repeated spam');
        expect(notice?.reasonCategory).toBe(
          ModerationReasonCategory.MODERATION_REASON_CATEGORY_OTHER,
        );
        expect(notice?.appealed).toBe(false);
        expect(notice?.appealDeadline).toBeDefined();

        // No oracle: a bystander never sees another actor's notice.
        const bystanderNotices = await myNotices(bystander);
        expect(bystanderNotices.notices.some((n) => n.id === notice?.id)).toBe(false);
      });

      it('synthesizes a POST_REMOVAL explanation distinct from reports.moderator_note', async () => {
        const author = await newActor();
        const reporter = await newActor();
        const postId = await createPost(author, `spam post ${testSuffix()}`);

        const report = await dataSource.getRepository(Report).save(
          dataSource.getRepository(Report).create({
            reporterActorId: reporter.actorId,
            subjectType: 'POST',
            subjectPostId: postId,
            reason: 'SPAM',
          }),
        );
        const internalNote = 'internal-only moderator note, never shown to the author';
        await resolveReportRemovePost(report.id, postId, internalNote);

        const authorNotices = await myNotices(author);
        const notice = authorNotices.notices.find(
          (n) => n.action === ModerationActionType.MODERATION_ACTION_TYPE_POST_REMOVAL,
        );
        expect(notice).toBeDefined();
        expect(notice?.postId).toBe(postId);
        // The whole point of §201.2/§55: the notice's explanation is never the internal note.
        expect(notice?.explanation).not.toBe(internalNote);
        expect(notice?.explanation.length).toBeGreaterThan(0);
      });
    });

    describe('AppealService', () => {
      it('creates, one-per-notice, and is invisible to anyone but the appellant', async () => {
        const subject = await newActor();
        const bystander = await newActor();
        await suspendActor(subject.actorId, 'appeal-flow reason');
        const notice = (await myNotices(subject)).notices.find(
          (n) => n.action === ModerationActionType.MODERATION_ACTION_TYPE_SUSPEND,
        );
        expect(notice).toBeDefined();
        const moderationNoticeId = notice?.id ?? '';

        const created = await callUnary<CreateAppealRequest, CreateAppealResponse>(
          appeals.createAppeal.bind(appeals),
          { moderationNoticeId, statement: 'I was not spamming.' },
          { accessToken: subject.accessToken },
        );
        expect(created.appeal?.status).toBe(AppealStatus.APPEAL_STATUS_OPEN);
        expect(created.appeal?.moderationNoticeId).toBe(moderationNoticeId);
        const appealId = created.appeal?.id ?? '';

        // One appeal per action.
        const duplicate = await expectRejection<CreateAppealRequest, CreateAppealResponse>(
          appeals.createAppeal.bind(appeals),
          { moderationNoticeId, statement: 'again' },
          { accessToken: subject.accessToken },
        );
        expect(duplicate.code).toBe(GrpcStatus.ALREADY_EXISTS);
        expect(duplicate.metadata.get(ERROR_CODE_METADATA_KEY)[0]).toBe('APPEAL_ALREADY_EXISTS');

        // Only the acted-upon actor may appeal — a bystander gets the same no-oracle
        // NOT_FOUND a nonexistent id would.
        const forbidden = await expectRejection<CreateAppealRequest, CreateAppealResponse>(
          appeals.createAppeal.bind(appeals),
          { moderationNoticeId, statement: 'not mine to appeal' },
          { accessToken: bystander.accessToken },
        );
        expect(forbidden.code).toBe(GrpcStatus.NOT_FOUND);
        expect(forbidden.metadata.get(ERROR_CODE_METADATA_KEY)[0]).toBe(
          'MODERATION_NOTICE_NOT_FOUND',
        );

        // The notice now reflects `appealed: true`.
        const noticesAfter = await myNotices(subject);
        expect(noticesAfter.notices.find((n) => n.id === moderationNoticeId)?.appealed).toBe(true);

        // GetAppeal: visible to the appellant, not to a bystander.
        const fetched = await callUnary<GetAppealRequest, GetAppealResponse>(
          appeals.getAppeal.bind(appeals),
          { id: appealId },
          { accessToken: subject.accessToken },
        );
        expect(fetched.appeal?.statement).toBe('I was not spamming.');

        const bystanderGet = await expectRejection<GetAppealRequest, GetAppealResponse>(
          appeals.getAppeal.bind(appeals),
          { id: appealId },
          { accessToken: bystander.accessToken },
        );
        expect(bystanderGet.code).toBe(GrpcStatus.NOT_FOUND);

        // ListMyAppeals: the caller's own appeal shows up.
        const listed = await callUnary<ListMyAppealsRequest, ListMyAppealsResponse>(
          appeals.listMyAppeals.bind(appeals),
          { cursor: '', limit: 20 },
          { accessToken: subject.accessToken },
        );
        expect(listed.appeals.some((a) => a.id === appealId)).toBe(true);
      });

      it('rejects an appeal filed after the node-configured appeal window has closed', async () => {
        const subject = await newActor();
        const auditLog = await suspendActor(subject.actorId, 'window test');

        // Backdate the enforcement action past the (default 14-day) appeal window — the same
        // effect an operator with a shorter APPEAL_WINDOW_DAYS would see immediately.
        await dataSource.query('UPDATE admin_audit_log SET created_at = $1 WHERE id = $2', [
          new Date(Date.now() - 30 * 24 * 60 * 60_000),
          auditLog.id,
        ]);

        const notice = (await myNotices(subject)).notices.find((n) => n.id === auditLog.id);
        // The projection itself already unsets appeal_deadline once the window has closed —
        // proto-loader decodes an unset nested-message field as `null`, not `undefined`
        // (docs/agents/LEARNINGS.md), so this checks both.
        expect(notice?.appealDeadline ?? undefined).toBeUndefined();

        const rejected = await expectRejection<CreateAppealRequest, CreateAppealResponse>(
          appeals.createAppeal.bind(appeals),
          { moderationNoticeId: auditLog.id, statement: 'too late' },
          { accessToken: subject.accessToken },
        );
        expect(rejected.code).toBe(GrpcStatus.FAILED_PRECONDITION);
        expect(rejected.metadata.get(ERROR_CODE_METADATA_KEY)[0]).toBe('APPEAL_WINDOW_CLOSED');
      });

      it(
        'stays reachable for an account still inside its deletion grace period (P14 follow-up: ' +
          'SuspensionTolerantAuthGuard previously rejected any deleted_at IS NOT NULL account ' +
          'outright, making the ban notice unappealable for the single case it exists for)',
        async () => {
          const subject = await newActor();
          const auditLog = await suspendActor(subject.actorId, 'ban pending appeal');
          const userId = await userIdForActor(subject.actorId);

          // Mirrors `patches-admin user delete <handle>` (`apps/admin/src/commands/user.ts`'s
          // `deleteUser`, this task's owned file): status flips to DELETED, deleted_at is set
          // on both `users` and `actors`, and an `account_deletion_requests` row is written
          // with a future `purge_after` — the account is gone-but-reversible, not purged.
          const now = new Date();
          const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          await dataSource.transaction(async (manager) => {
            await manager
              .getRepository(User)
              .update({ id: userId }, { status: 'DELETED', deletedAt: now });
            await manager.getRepository(Actor).update({ id: subject.actorId }, { deletedAt: now });
            await manager.getRepository(AccountDeletionRequest).save(
              manager.getRepository(AccountDeletionRequest).create({
                actorId: subject.actorId,
                requestedAt: now,
                purgeAfter,
                cancelledAt: null,
                purgedAt: null,
              }),
            );
          });

          // The access token issued before deletion still authenticates against
          // SuspensionTolerantAuthGuard-protected RPCs while the grace period is open.
          const notices = await myNotices(subject);
          const notice = notices.notices.find((n) => n.id === auditLog.id);
          expect(notice).toBeDefined();

          const created = await callUnary<CreateAppealRequest, CreateAppealResponse>(
            appeals.createAppeal.bind(appeals),
            { moderationNoticeId: auditLog.id, statement: 'please reconsider before purge' },
            { accessToken: subject.accessToken },
          );
          expect(created.appeal?.status).toBe(AppealStatus.APPEAL_STATUS_OPEN);

          // Past purge_after (or cancelled/purged), the same guard rejects it again — the
          // grace period, not deletion itself, is what keeps the account reachable.
          await dataSource
            .getRepository(AccountDeletionRequest)
            .update({ actorId: subject.actorId }, { purgeAfter: new Date(now.getTime() - 1000) });

          const rejected = await expectRejection<
            ListMyModerationNoticesRequest,
            ListMyModerationNoticesResponse
          >(
            moderation.listMyModerationNotices.bind(moderation),
            { cursor: '', limit: 20 },
            {
              accessToken: subject.accessToken,
            },
          );
          expect(rejected.code).toBe(GrpcStatus.UNAUTHENTICATED);
          expect(rejected.metadata.get(ERROR_CODE_METADATA_KEY)[0]).toBe('AUTH_SESSION_EXPIRED');
        },
      );
    });
  },
);
