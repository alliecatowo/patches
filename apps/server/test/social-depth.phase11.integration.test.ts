import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createActorClient,
  createAuthClient,
  createFeedClient,
  createNodeClient,
  createPostClient,
  createReactionClient,
  type ActorGrpcClient,
  type AuthGrpcClient,
  type CreatePostRequest,
  type CreatePostResponse,
  type EditPostRequest,
  type EditPostResponse,
  type FeedGrpcClient,
  type GetActorRequest,
  type GetActorResponse,
  type GetNodeInfoRequest,
  type GetNodeInfoResponse,
  type GetPostRequest,
  type GetPostResponse,
  type ListActorPostsRequest,
  type ListActorPostsResponse,
  type ListCommunityFeedRequest,
  type ListCommunityFeedResponse,
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type ListPostEditsRequest,
  type ListPostEditsResponse,
  type ListTagFeedRequest,
  type ListTagFeedResponse,
  type NodeGrpcClient,
  type PinPostRequest,
  type PinPostResponse,
  type PostGrpcClient,
  type ReactionGrpcClient,
  type RepostPostRequest,
  type RepostPostResponse,
  type UnrepostPostRequest,
  type UnrepostPostResponse,
  type UpdateProfileRequest,
  type UpdateProfileResponse,
} from '@patches/proto';
import { NameTagStyle, PostVisibility, ProfileFrame, QuotePolicy } from '@patches/proto/nest';
import {
  createTestCommunity,
  createTestCommunityMember,
  createTestFollow,
  createTestTagMute,
  createTestUser,
} from '@patches/testkit';
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

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping Phase 11 social-depth integration tests: TEST_DATABASE_URL is not set.',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'Phase 11 social depth over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let actors: ActorGrpcClient;
    let posts: PostGrpcClient;
    let feeds: FeedGrpcClient;
    let reactions: ReactionGrpcClient;
    let node: NodeGrpcClient;
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
      const credentials = grpcCredentials.createInsecure();
      auth = createAuthClient(server.url, credentials);
      actors = createActorClient(server.url, credentials);
      posts = createPostClient(server.url, credentials);
      feeds = createFeedClient(server.url, credentials);
      reactions = createReactionClient(server.url, credentials);
      node = createNodeClient(server.url, credentials);

      alice = await registerTestActor(auth, dataSource, inviterUserId);
      bob = await registerTestActor(auth, dataSource, inviterUserId);
    }, 60_000);

    afterAll(async () => {
      auth.close();
      actors.close();
      posts.close();
      feeds.close();
      reactions.close();
      node.close();
      await server.close();
      await dataSource.destroy();
    });

    function postRequest(overrides: Partial<CreatePostRequest> = {}): CreatePostRequest {
      return {
        clientRequestId: randomUUID(),
        body: `phase 11 post ${testSuffix()}`,
        linkUrl: '',
        visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
        contentWarning: '',
        inReplyToId: '',
        mediaIds: [],
        quotedPostId: '',
        communityId: '',
        quotePolicy: QuotePolicy.QUOTE_POLICY_ANYONE,
        ...overrides,
      };
    }

    async function createPost(
      author: TestActor,
      overrides: Partial<CreatePostRequest> = {},
    ): Promise<NonNullable<CreatePostResponse['post']>> {
      const response = await callUnary<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        postRequest(overrides),
        { accessToken: author.accessToken },
      );
      if (response.post === undefined) throw new Error('CreatePost did not return a post.');
      return response.post;
    }

    function fieldMask(paths: string[]): UpdateProfileRequest['updateMask'] {
      return { paths } as unknown as UpdateProfileRequest['updateMask'];
    }

    it('enforces quote policy server-side', async () => {
      const source = await createPost(alice, {
        body: `do not quote ${testSuffix()}`,
        quotePolicy: QuotePolicy.QUOTE_POLICY_NOBODY,
      });

      const error = await expectRejection<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        postRequest({ body: 'forbidden quote', quotedPostId: source.id }),
        { accessToken: bob.accessToken },
      );

      expect(error.code).toBe(GrpcStatus.PERMISSION_DENIED);
    });

    it('reposts as a pointer with real state/counts and home-feed attribution', async () => {
      const viewer = await registerTestActor(auth, dataSource, inviterUserId);
      await createTestFollow(dataSource.manager, {
        followerActorId: viewer.actorId,
        followeeActorId: bob.actorId,
      });
      const original = await createPost(alice, { body: `old original ${testSuffix()}` });
      await dataSource.query(
        "UPDATE posts SET created_at = now() - interval '1 day' WHERE id = $1",
        [original.id],
      );
      const before = await callUnary<GetPostRequest, GetPostResponse>(posts.getPost.bind(posts), {
        id: original.id,
      });

      const reposted = await callUnary<RepostPostRequest, RepostPostResponse>(
        reactions.repostPost.bind(reactions),
        { postId: original.id },
        { accessToken: bob.accessToken },
      );
      expect(reposted.counts?.reposts).toBe(1);
      expect(reposted.viewerState?.reposted).toBe(true);

      const home = await callUnary<ListHomeFeedRequest, ListHomeFeedResponse>(
        feeds.listHomeFeed.bind(feeds),
        { cursor: '', limit: 50 },
        { accessToken: viewer.accessToken },
      );
      const attributed = home.posts.find((post) => post.id === original.id);
      expect(attributed?.repostedBy.map((actor) => actor.id)).toContain(bob.actorId);
      expect(attributed?.repostedByTotal).toBe(1);
      expect(attributed?.createdAt).toEqual(before.post?.createdAt);

      const unreposted = await callUnary<UnrepostPostRequest, UnrepostPostResponse>(
        reactions.unrepostPost.bind(reactions),
        { postId: original.id },
        { accessToken: bob.accessToken },
      );
      expect(unreposted.counts?.reposts).toBe(0);
      expect(unreposted.viewerState?.reposted).toBe(false);
    });

    it('snapshots edits without changing createdAt or chronological feed position', async () => {
      const originalBody = `before edit ${testSuffix()}`;
      const older = await createPost(alice, { body: originalBody, contentWarning: 'old warning' });
      await dataSource.query(
        "UPDATE posts SET created_at = now() - interval '1 day' WHERE id = $1",
        [older.id],
      );
      const before = await callUnary<GetPostRequest, GetPostResponse>(posts.getPost.bind(posts), {
        id: older.id,
      });
      const newer = await createPost(alice, { body: `newer post ${testSuffix()}` });

      const edited = await callUnary<EditPostRequest, EditPostResponse>(
        posts.editPost.bind(posts),
        { id: older.id, body: 'after edit', contentWarning: 'new warning', mediaIds: [] },
        { accessToken: alice.accessToken },
      );
      expect(edited.post?.body).toBe('after edit');
      expect(edited.post?.createdAt).toEqual(before.post?.createdAt);
      expect(edited.post?.editedAt).toBeDefined();

      const history = await callUnary<ListPostEditsRequest, ListPostEditsResponse>(
        posts.listPostEdits.bind(posts),
        { postId: older.id, cursor: '', limit: 20 },
      );
      expect(history.edits).toHaveLength(1);
      expect(history.edits[0]?.previousBody).toBe(originalBody);
      expect(history.edits[0]?.previousContentWarning).toBe('old warning');

      const feed = await callUnary<ListActorPostsRequest, ListActorPostsResponse>(
        feeds.listActorPosts.bind(feeds),
        { actorId: alice.actorId, cursor: '', limit: 50 },
      );
      expect(feed.posts.findIndex((post) => post.id === newer.id)).toBeLessThan(
        feed.posts.findIndex((post) => post.id === older.id),
      );
    });

    it('bounds profile pins at three positions and exposes them in display order', async () => {
      const pinnable = await Promise.all([
        createPost(alice, { body: `pin zero ${testSuffix()}` }),
        createPost(alice, { body: `pin one ${testSuffix()}` }),
        createPost(alice, { body: `pin two ${testSuffix()}` }),
        createPost(alice, { body: `pin overflow ${testSuffix()}` }),
      ]);

      for (const [position, post] of pinnable.slice(0, 3).entries()) {
        await callUnary<PinPostRequest, PinPostResponse>(
          posts.pinPost.bind(posts),
          { postId: post.id, position },
          { accessToken: alice.accessToken },
        );
      }
      const profile = await callUnary<GetActorRequest, GetActorResponse>(
        actors.getActor.bind(actors),
        { id: alice.actorId },
      );
      expect(profile.actor?.pinnedPostIds).toEqual(pinnable.slice(0, 3).map((post) => post.id));

      const error = await expectRejection<PinPostRequest, PinPostResponse>(
        posts.pinPost.bind(posts),
        { postId: pinnable[3].id, position: 3 },
        { accessToken: alice.accessToken },
      );
      expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
    });

    it('rejects an eleventh tag and filters tag feeds to PUBLIC, unmuted posts', async () => {
      const elevenTags = Array.from({ length: 11 }, (_, index) => `#tag${String(index)}`).join(' ');
      const error = await expectRejection<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        postRequest({ body: elevenTags }),
        { accessToken: alice.accessToken },
      );
      expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);

      const tag = `depth${testSuffix()}`;
      const visible = await createPost(alice, { body: `public #${tag}` });
      const unlisted = await createPost(alice, {
        body: `unlisted #${tag}`,
        visibility: PostVisibility.POST_VISIBILITY_UNLISTED,
      });
      const anonymous = await callUnary<ListTagFeedRequest, ListTagFeedResponse>(
        feeds.listTagFeed.bind(feeds),
        { tag: tag.toUpperCase(), cursor: '', limit: 20 },
      );
      expect(anonymous.posts.map((post) => post.id)).toContain(visible.id);
      expect(anonymous.posts.map((post) => post.id)).not.toContain(unlisted.id);

      const rows = await dataSource.query<Array<{ id: string }>>(
        'SELECT id FROM tags WHERE name = $1',
        [tag],
      );
      if (rows[0] === undefined) throw new Error('CreatePost did not attach its extracted tag.');
      await createTestTagMute(dataSource.manager, { actorId: bob.actorId, tagId: rows[0].id });

      const muted = await callUnary<ListTagFeedRequest, ListTagFeedResponse>(
        feeds.listTagFeed.bind(feeds),
        { tag, cursor: '', limit: 20 },
        { accessToken: bob.accessToken },
      );
      expect(muted.posts).toEqual([]);
    });

    it('keeps community posts out of anonymous local feed and visible to members', async () => {
      const community = await createTestCommunity(dataSource.manager, {
        createdByActorId: alice.actorId,
      });
      await createTestCommunityMember(dataSource.manager, {
        communityId: community.id,
        actorId: alice.actorId,
      });
      await createTestCommunityMember(dataSource.manager, {
        communityId: community.id,
        actorId: bob.actorId,
      });
      const communityPost = await createPost(alice, {
        body: `community post ${testSuffix()}`,
        communityId: community.id,
      });

      const anonymousLocal = await callUnary<ListLocalFeedRequest, ListLocalFeedResponse>(
        feeds.listLocalFeed.bind(feeds),
        { cursor: '', limit: 50 },
      );
      expect(anonymousLocal.posts.map((post) => post.id)).not.toContain(communityPost.id);

      const memberLocal = await callUnary<ListLocalFeedRequest, ListLocalFeedResponse>(
        feeds.listLocalFeed.bind(feeds),
        { cursor: '', limit: 50 },
        { accessToken: bob.accessToken },
      );
      expect(memberLocal.posts.map((post) => post.id)).toContain(communityPost.id);

      const communityFeed = await callUnary<ListCommunityFeedRequest, ListCommunityFeedResponse>(
        feeds.listCommunityFeed.bind(feeds),
        { communityId: community.id, cursor: '', limit: 20 },
      );
      expect(communityFeed.posts.map((post) => post.id)).toContain(communityPost.id);
    });

    it('round-trips validated flair and publishes default dynamic social capabilities', async () => {
      const document = JSON.stringify({ post_accent: '#FFFFFF', border_style: 'single' });
      const updated = await callUnary<UpdateProfileRequest, UpdateProfileResponse>(
        actors.updateProfile.bind(actors),
        {
          displayName: '',
          bio: '',
          locationText: '',
          websiteUrl: '',
          nameplate: undefined,
          flair: { document, updatedAt: undefined },
          profileBannerUrl: '',
          profileFrame: ProfileFrame.PROFILE_FRAME_UNSPECIFIED,
          nameTagStyle: NameTagStyle.NAME_TAG_STYLE_UNSPECIFIED,
          accentColor: '',
          avatarMediaId: '',
          bannerMediaId: '',
          updateMask: fieldMask(['flair']),
        },
        { accessToken: bob.accessToken },
      );
      expect(JSON.parse(updated.actor?.flair?.document ?? '')).toEqual(JSON.parse(document));
      expect(updated.actor?.flair?.updatedAt).toBeDefined();

      const info = await callUnary<GetNodeInfoRequest, GetNodeInfoResponse>(
        node.getNodeInfo.bind(node),
        {},
      );
      expect(info.limits?.postBodyMaxChars).toBe(5000);
      expect(info.socialCapabilities).toEqual({
        likeGlyphAllowList: [],
        maxPostChars: 5000,
        canCreateCommunity: true,
        dmEnabled: true,
        dmRetentionDays: 0,
      });
    });
  },
);
