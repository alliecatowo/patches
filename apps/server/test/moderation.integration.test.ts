import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAuthClient,
  createFeedClient,
  createModerationClient,
  createPostClient,
  createSocialGraphClient,
  type AuthGrpcClient,
  type BlockActorRequest,
  type BlockActorResponse,
  type CreatePostRequest,
  type CreatePostResponse,
  type FeedGrpcClient,
  type FollowActorRequest,
  type FollowActorResponse,
  type GetPostRequest,
  type GetPostResponse,
  type ListBlocksRequest,
  type ListBlocksResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type ListMutesRequest,
  type ListMutesResponse,
  type ModerationGrpcClient,
  type MuteActorRequest,
  type MuteActorResponse,
  type PostGrpcClient,
  type ReportActorRequest,
  type ReportActorResponse,
  type ReportPostRequest,
  type ReportPostResponse,
  type SocialGraphGrpcClient,
  type UnblockActorRequest,
  type UnblockActorResponse,
  type UnmuteActorRequest,
  type UnmuteActorResponse,
  FOLLOW_STATE,
} from '@patches/proto';
import { PostVisibility, ReportReason } from '@patches/proto/nest';
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
 * `ModerationService` end-to-end over real gRPC against real PostgreSQL (spec §118–§119):
 * block/unblock/mute/unmute idempotency, block removing an existing follow both ways and
 * hiding posts from feeds/`GetPost` (§62), mute hiding posts from the home feed without
 * touching follows (§63), and `ReportPost`/`ReportActor`.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping moderation integration tests: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'moderation over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let posts: PostGrpcClient;
    let graph: SocialGraphGrpcClient;
    let moderation: ModerationGrpcClient;
    let feeds: FeedGrpcClient;
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
      graph = createSocialGraphClient(server.url, grpcCredentials.createInsecure());
      moderation = createModerationClient(server.url, grpcCredentials.createInsecure());
      feeds = createFeedClient(server.url, grpcCredentials.createInsecure());
    }, 60_000);

    afterAll(async () => {
      auth.close();
      posts.close();
      graph.close();
      moderation.close();
      feeds.close();
      await server.close();
      await dataSource.destroy();
    });

    async function newActor(): Promise<TestActor> {
      return registerTestActor(auth, dataSource, inviterUserId);
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
        },
        { accessToken: author.accessToken },
      );
      return response.post?.id ?? '';
    }

    describe('BlockActor / UnblockActor', () => {
      it('is idempotent, removes an existing follow both ways, and hides posts (§62)', async () => {
        const alice = await newActor();
        const dave = await newActor();

        await callUnary<FollowActorRequest, FollowActorResponse>(
          graph.followActor.bind(graph),
          { actorId: dave.actorId },
          { accessToken: alice.accessToken },
        );
        await callUnary<FollowActorRequest, FollowActorResponse>(
          graph.followActor.bind(graph),
          { actorId: alice.actorId },
          { accessToken: dave.accessToken },
        );

        const postId = await createPost(dave, `dave's post ${testSuffix()}`);

        const blocked = await callUnary<BlockActorRequest, BlockActorResponse>(
          moderation.blockActor.bind(moderation),
          { actorId: dave.actorId },
          { accessToken: alice.accessToken },
        );
        expect(blocked.relationship?.blocking).toBe(true);
        expect(blocked.relationship?.state).toBe(FOLLOW_STATE.NONE);
        expect(blocked.relationship?.followedBy).toBe(false);

        // Idempotent.
        const blockedAgain = await callUnary<BlockActorRequest, BlockActorResponse>(
          moderation.blockActor.bind(moderation),
          { actorId: dave.actorId },
          { accessToken: alice.accessToken },
        );
        expect(blockedAgain.relationship?.blocking).toBe(true);

        // A blocks D: neither GetPost by A nor D sees the other's post via block-aware paths.
        const aliceGetsDavesPost = await expectRejection<GetPostRequest, GetPostResponse>(
          posts.getPost.bind(posts),
          { id: postId },
          { accessToken: alice.accessToken },
        );
        expect(aliceGetsDavesPost.code).toBe(GrpcStatus.NOT_FOUND);

        const localFeed = await callUnary<ListLocalFeedRequest, ListLocalFeedResponse>(
          feeds.listLocalFeed.bind(feeds),
          { cursor: '', limit: 50 },
          { accessToken: alice.accessToken },
        );
        expect(localFeed.posts.some((post) => post.id === postId)).toBe(false);

        const listedBlocks = await callUnary<ListBlocksRequest, ListBlocksResponse>(
          moderation.listBlocks.bind(moderation),
          { cursor: '', limit: 20 },
          { accessToken: alice.accessToken },
        );
        expect(listedBlocks.actors.map((actor) => actor.id)).toContain(dave.actorId);

        const unblocked = await callUnary<UnblockActorRequest, UnblockActorResponse>(
          moderation.unblockActor.bind(moderation),
          { actorId: dave.actorId },
          { accessToken: alice.accessToken },
        );
        expect(unblocked.relationship?.blocking).toBe(false);

        // Idempotent.
        const unblockedAgain = await callUnary<UnblockActorRequest, UnblockActorResponse>(
          moderation.unblockActor.bind(moderation),
          { actorId: dave.actorId },
          { accessToken: alice.accessToken },
        );
        expect(unblockedAgain.relationship?.blocking).toBe(false);
      });
    });

    describe('MuteActor / UnmuteActor', () => {
      it('is idempotent, hides posts from the home feed, and never touches the follow (§63)', async () => {
        const alice = await newActor();
        const erin = await newActor();

        await callUnary<FollowActorRequest, FollowActorResponse>(
          graph.followActor.bind(graph),
          { actorId: erin.actorId },
          { accessToken: alice.accessToken },
        );
        const postId = await createPost(erin, `erin's post ${testSuffix()}`);

        const muted = await callUnary<MuteActorRequest, MuteActorResponse>(
          moderation.muteActor.bind(moderation),
          { actorId: erin.actorId },
          { accessToken: alice.accessToken },
        );
        expect(muted.relationship?.muting).toBe(true);
        // Muting never removes the follow (§63).
        expect(muted.relationship?.state).toBe(FOLLOW_STATE.FOLLOWING);

        const listedMutes = await callUnary<ListMutesRequest, ListMutesResponse>(
          moderation.listMutes.bind(moderation),
          { cursor: '', limit: 20 },
          { accessToken: alice.accessToken },
        );
        expect(listedMutes.actors.map((actor) => actor.id)).toContain(erin.actorId);

        // A muted actor's post is still directly gettable (mute is not a block) but disappears
        // from the muter's home feed (spec §63).
        const fetched = await callUnary<GetPostRequest, GetPostResponse>(
          posts.getPost.bind(posts),
          { id: postId },
          { accessToken: alice.accessToken },
        );
        expect(fetched.post?.id).toBe(postId);

        const unmuted = await callUnary<UnmuteActorRequest, UnmuteActorResponse>(
          moderation.unmuteActor.bind(moderation),
          { actorId: erin.actorId },
          { accessToken: alice.accessToken },
        );
        expect(unmuted.relationship?.muting).toBe(false);

        const unmutedAgain = await callUnary<UnmuteActorRequest, UnmuteActorResponse>(
          moderation.unmuteActor.bind(moderation),
          { actorId: erin.actorId },
          { accessToken: alice.accessToken },
        );
        expect(unmutedAgain.relationship?.muting).toBe(false);
      });
    });

    describe('ReportPost / ReportActor', () => {
      it('accepts a bounded report and returns a report id', async () => {
        const alice = await newActor();
        const frank = await newActor();
        const postId = await createPost(frank, `reportable ${testSuffix()}`);

        const postReport = await callUnary<ReportPostRequest, ReportPostResponse>(
          moderation.reportPost.bind(moderation),
          { postId, reason: ReportReason.REPORT_REASON_SPAM, details: 'looks like spam' },
          { accessToken: alice.accessToken },
        );
        expect(postReport.reportId.length).toBeGreaterThan(0);

        const actorReport = await callUnary<ReportActorRequest, ReportActorResponse>(
          moderation.reportActor.bind(moderation),
          {
            actorId: frank.actorId,
            reason: ReportReason.REPORT_REASON_HARASSMENT,
            details: '',
          },
          { accessToken: alice.accessToken },
        );
        expect(actorReport.reportId.length).toBeGreaterThan(0);
      });

      it('rejects an unauthenticated caller with UNAUTHENTICATED', async () => {
        const frank = await newActor();
        const postId = await createPost(frank, `needs auth to report ${testSuffix()}`);
        const error = await expectRejection<ReportPostRequest, ReportPostResponse>(
          moderation.reportPost.bind(moderation),
          { postId, reason: ReportReason.REPORT_REASON_SPAM, details: '' },
        );
        expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
      });
    });
  },
);
