import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials } from '@grpc/grpc-js';
import {
  createAuthClient,
  createModerationClient,
  createNotificationClient,
  createPostClient,
  createReactionClient,
  type AuthGrpcClient,
  type CreatePostRequest,
  type CreatePostResponse,
  type GetUnreadCountRequest,
  type GetUnreadCountResponse,
  type LikePostRequest,
  type LikePostResponse,
  type ListNotificationsRequest,
  type ListNotificationsResponse,
  type MarkNotificationsReadRequest,
  type MarkNotificationsReadResponse,
  type ModerationGrpcClient,
  type MuteActorRequest,
  type MuteActorResponse,
  type NotificationGrpcClient,
  type PostGrpcClient,
  type ReactionGrpcClient,
} from '@patches/proto';
import { NotificationType, PostVisibility, QuotePolicy } from '@patches/proto/nest';
import { createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { registerTestActor, testSuffix, type TestActor } from './support/fixtures.js';
import { callUnary, startTestServer, type TestServer } from './support/test-server.js';

/**
 * `NotificationService` end-to-end over real gRPC against real PostgreSQL (spec §118–§119):
 * REPLY/MENTION notification creation off `PostService`, LIKE off `ReactionsService`, dedupe,
 * `MarkNotificationsRead`, `GetUnreadCount`, and mute suppression (spec §63). No `FOLLOW`
 * notification test here — `NotificationsService.notifyFollow` exists and is exported, but
 * `GraphService.followActor` (out of this task's file scope) doesn't call it yet; see this
 * task's report for that follow-up.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping notifications integration tests: TEST_DATABASE_URL is not set ' +
      '(start Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'notifications over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let posts: PostGrpcClient;
    let reactions: ReactionGrpcClient;
    let notifications: NotificationGrpcClient;
    let moderation: ModerationGrpcClient;
    let inviterUserId: string;
    let alice: TestActor;
    let bob: TestActor;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `inviter${testSuffix()}`,
      });
      inviterUserId = user.id;

      server = await startTestServer();
      auth = createAuthClient(server.url, grpcCredentials.createInsecure());
      posts = createPostClient(server.url, grpcCredentials.createInsecure());
      reactions = createReactionClient(server.url, grpcCredentials.createInsecure());
      notifications = createNotificationClient(server.url, grpcCredentials.createInsecure());
      moderation = createModerationClient(server.url, grpcCredentials.createInsecure());

      alice = await registerTestActor(auth, dataSource, inviterUserId);
      bob = await registerTestActor(auth, dataSource, inviterUserId);
    }, 60_000);

    afterAll(async () => {
      auth.close();
      posts.close();
      reactions.close();
      notifications.close();
      moderation.close();
      await server.close();
      await dataSource.destroy();
    });

    async function createPost(author: TestActor, body: string, inReplyToId = ''): Promise<string> {
      const response = await callUnary<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        {
          clientRequestId: randomUUID(),
          body,
          linkUrl: '',
          visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
          contentWarning: '',
          inReplyToId,
          mediaIds: [],
          quotedPostId: '',
          communityId: '',
          quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
        },
        { accessToken: author.accessToken },
      );
      return response.post?.id ?? '';
    }

    it('creates a REPLY notification for the parent post author', async () => {
      const rootId = await createPost(alice, `notify me on reply ${testSuffix()}`);
      await createPost(bob, `a reply that should notify alice ${testSuffix()}`, rootId);

      const list = await callUnary<ListNotificationsRequest, ListNotificationsResponse>(
        notifications.listNotifications.bind(notifications),
        { cursor: '', limit: 20 },
        { accessToken: alice.accessToken },
      );
      const replyNotification = list.notifications.find(
        (row) => row.type === NotificationType.NOTIFICATION_TYPE_REPLY && row.postId !== '',
      );
      expect(replyNotification?.actor?.id).toBe(bob.actorId);
    });

    it('creates a MENTION notification when a body mentions a local handle', async () => {
      await createPost(bob, `hey @${alice.handle} check this out ${testSuffix()}`);

      const list = await callUnary<ListNotificationsRequest, ListNotificationsResponse>(
        notifications.listNotifications.bind(notifications),
        { cursor: '', limit: 20 },
        { accessToken: alice.accessToken },
      );
      const mention = list.notifications.find(
        (row) => row.type === NotificationType.NOTIFICATION_TYPE_MENTION,
      );
      expect(mention?.actor?.id).toBe(bob.actorId);
    });

    it('creates a LIKE notification and never notifies a self-like', async () => {
      const postId = await createPost(alice, `like me ${testSuffix()}`);
      await callUnary<LikePostRequest, LikePostResponse>(
        reactions.likePost.bind(reactions),
        { postId },
        { accessToken: bob.accessToken },
      );

      const aliceList = await callUnary<ListNotificationsRequest, ListNotificationsResponse>(
        notifications.listNotifications.bind(notifications),
        { cursor: '', limit: 20 },
        { accessToken: alice.accessToken },
      );
      expect(
        aliceList.notifications.some(
          (row) => row.type === NotificationType.NOTIFICATION_TYPE_LIKE && row.postId === postId,
        ),
      ).toBe(true);

      // Alice liking her own post must never produce a notification (never notify yourself).
      await callUnary<LikePostRequest, LikePostResponse>(
        reactions.likePost.bind(reactions),
        { postId },
        { accessToken: alice.accessToken },
      );
      const selfLikeCount = (
        await callUnary<ListNotificationsRequest, ListNotificationsResponse>(
          notifications.listNotifications.bind(notifications),
          { cursor: '', limit: 20 },
          { accessToken: alice.accessToken },
        )
      ).notifications.filter(
        (row) => row.type === NotificationType.NOTIFICATION_TYPE_LIKE && row.postId === postId,
      ).length;
      expect(selfLikeCount).toBe(1);
    });

    it('suppresses a LIKE notification once the recipient mutes the actor (§63)', async () => {
      const postId = await createPost(alice, `mute suppresses this like ${testSuffix()}`);
      await callUnary<MuteActorRequest, MuteActorResponse>(
        moderation.muteActor.bind(moderation),
        { actorId: bob.actorId },
        { accessToken: alice.accessToken },
      );

      await callUnary<LikePostRequest, LikePostResponse>(
        reactions.likePost.bind(reactions),
        { postId },
        { accessToken: bob.accessToken },
      );

      const list = await callUnary<ListNotificationsRequest, ListNotificationsResponse>(
        notifications.listNotifications.bind(notifications),
        { cursor: '', limit: 20 },
        { accessToken: alice.accessToken },
      );
      expect(
        list.notifications.some(
          (row) => row.type === NotificationType.NOTIFICATION_TYPE_LIKE && row.postId === postId,
        ),
      ).toBe(false);
    });

    it('MarkNotificationsRead(mark_all) marks everything read and GetUnreadCount reflects it', async () => {
      const carol = await registerTestActor(auth, dataSource, inviterUserId);
      const postId = await createPost(carol, `unread tracking ${testSuffix()}`);
      await callUnary<LikePostRequest, LikePostResponse>(
        reactions.likePost.bind(reactions),
        { postId },
        { accessToken: alice.accessToken },
      );

      const before = await callUnary<GetUnreadCountRequest, GetUnreadCountResponse>(
        notifications.getUnreadCount.bind(notifications),
        {},
        { accessToken: carol.accessToken },
      );
      expect(before.count).toBeGreaterThan(0);

      await callUnary<MarkNotificationsReadRequest, MarkNotificationsReadResponse>(
        notifications.markNotificationsRead.bind(notifications),
        { throughId: '', markAll: true },
        { accessToken: carol.accessToken },
      );

      const after = await callUnary<GetUnreadCountRequest, GetUnreadCountResponse>(
        notifications.getUnreadCount.bind(notifications),
        {},
        { accessToken: carol.accessToken },
      );
      expect(after.count).toBe(0);
    });
  },
);
