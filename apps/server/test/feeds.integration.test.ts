import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAuthClient,
  createFeedClient,
  createPostClient,
  type AuthGrpcClient,
  type CreatePostRequest,
  type CreatePostResponse,
  type FeedGrpcClient,
  type ListActorPostsRequest,
  type ListActorPostsResponse,
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type PostGrpcClient,
} from '@patches/proto';
import { PostVisibility, QuotePolicy } from '@patches/proto/nest';
import {
  createTestBlock,
  createTestFollow,
  createTestMute,
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

/**
 * `FeedService` end-to-end over real gRPC against real PostgreSQL (spec §118–§119):
 * chronological keyset pagination (§46) with no duplicates/gaps across pages, the visibility
 * filter seam (`FOLLOWERS`-visibility posts, blocks, mutes — spec §59, §62–63), and
 * `ListHomeFeed`'s fan-out-on-read scoping (own posts + followed actors only).
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping feeds integration tests: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'feeds over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let posts: PostGrpcClient;
    let feeds: FeedGrpcClient;
    let inviterUserId: string;
    let alice: TestActor;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `inviter${testSuffix()}`,
      });
      inviterUserId = user.id;

      server = await startTestServer();
      auth = createAuthClient(server.url, grpcCredentials.createInsecure());
      posts = createPostClient(server.url, grpcCredentials.createInsecure());
      feeds = createFeedClient(server.url, grpcCredentials.createInsecure());

      alice = await registerTestActor(auth, dataSource, inviterUserId);
    }, 60_000);

    afterAll(async () => {
      auth.close();
      posts.close();
      feeds.close();
      await server.close();
      await dataSource.destroy();
    });

    async function createPost(overrides: Partial<CreatePostRequest> = {}): Promise<string> {
      const response = await callUnary<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        {
          clientRequestId: randomUUID(),
          body: `feed test post ${testSuffix()}`,
          linkUrl: '',
          visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
          contentWarning: '',
          inReplyToId: '',
          mediaIds: [],
          quotedPostId: '',
          communityId: '',
          quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
          ...overrides,
        },
        { accessToken: alice.accessToken },
      );
      const id = response.post?.id;
      if (id === undefined) throw new Error('createPost did not return a post');
      return id;
    }

    describe('ListActorPosts', () => {
      it('paginates chronologically with no duplicates or gaps across pages', async () => {
        const author = await registerTestActor(auth, dataSource, inviterUserId);
        const ids: string[] = [];
        for (let index = 0; index < 5; index += 1) {
          const response = await callUnary<CreatePostRequest, CreatePostResponse>(
            posts.createPost.bind(posts),
            {
              clientRequestId: randomUUID(),
              body: `post ${String(index)}`,
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
          ids.push(response.post?.id ?? '');
        }

        const seen: string[] = [];
        let cursor = '';
        for (let guard = 0; guard < 10; guard += 1) {
          const page = await callUnary<ListActorPostsRequest, ListActorPostsResponse>(
            feeds.listActorPosts.bind(feeds),
            { actorId: author.actorId, cursor, limit: 2 },
          );
          seen.push(...page.posts.map((post) => post.id));
          if (!page.page?.hasMore) break;
          cursor = page.page?.nextCursor ?? '';
        }

        expect(seen).toHaveLength(5);
        expect(new Set(seen).size).toBe(5);
        // Newest first (created_at DESC, id DESC — spec §46), so the creation order is reversed.
        expect(seen).toEqual([...ids].reverse());
      });

      it('excludes FOLLOWERS-visibility posts (visibility filter seam, P3-002)', async () => {
        const author = await registerTestActor(auth, dataSource, inviterUserId);
        await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          {
            clientRequestId: randomUUID(),
            body: 'followers only',
            linkUrl: '',
            visibility: PostVisibility.POST_VISIBILITY_FOLLOWERS,
            contentWarning: '',
            inReplyToId: '',
            mediaIds: [],
            quotedPostId: '',
            communityId: '',
            quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
          },
          { accessToken: author.accessToken },
        );
        await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          {
            clientRequestId: randomUUID(),
            body: 'public',
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

        const page = await callUnary<ListActorPostsRequest, ListActorPostsResponse>(
          feeds.listActorPosts.bind(feeds),
          { actorId: author.actorId, cursor: '', limit: 10 },
        );
        expect(page.posts.map((post) => post.body)).toEqual(['public']);
      });
    });

    describe('ListLocalFeed', () => {
      it('includes local public posts, readable anonymously', async () => {
        const id = await createPost({ body: 'visible in the local feed' });

        const page = await callUnary<ListLocalFeedRequest, ListLocalFeedResponse>(
          feeds.listLocalFeed.bind(feeds),
          { cursor: '', limit: 50 },
        );
        expect(page.posts.some((post) => post.id === id)).toBe(true);
      });

      it('hides a blocked-either-direction author from an authenticated viewer (§62)', async () => {
        const viewer = await registerTestActor(auth, dataSource, inviterUserId);
        const blocked = await registerTestActor(auth, dataSource, inviterUserId);
        await createTestBlock(dataSource.manager, {
          blockerActorId: viewer.actorId,
          blockedActorId: blocked.actorId,
        });

        const response = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          {
            clientRequestId: randomUUID(),
            body: `blocked author post ${testSuffix()}`,
            linkUrl: '',
            visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
            contentWarning: '',
            inReplyToId: '',
            mediaIds: [],
            quotedPostId: '',
            communityId: '',
            quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
          },
          { accessToken: blocked.accessToken },
        );
        const blockedPostId = response.post?.id;

        const anonymousPage = await callUnary<ListLocalFeedRequest, ListLocalFeedResponse>(
          feeds.listLocalFeed.bind(feeds),
          { cursor: '', limit: 50 },
        );
        expect(anonymousPage.posts.some((post) => post.id === blockedPostId)).toBe(true);

        const viewerPage = await callUnary<ListLocalFeedRequest, ListLocalFeedResponse>(
          feeds.listLocalFeed.bind(feeds),
          { cursor: '', limit: 50 },
          { accessToken: viewer.accessToken },
        );
        expect(viewerPage.posts.some((post) => post.id === blockedPostId)).toBe(false);
      });
    });

    describe('ListHomeFeed', () => {
      it('includes own posts and followed actors, excludes everyone else (§59)', async () => {
        const viewer = await registerTestActor(auth, dataSource, inviterUserId);
        const followed = await registerTestActor(auth, dataSource, inviterUserId);
        const stranger = await registerTestActor(auth, dataSource, inviterUserId);
        await createTestFollow(dataSource.manager, {
          followerActorId: viewer.actorId,
          followeeActorId: followed.actorId,
        });

        const ownPostId = await createPostAs(viewer.accessToken, 'my own post');
        const followedPostId = await createPostAs(followed.accessToken, 'a post I should see');
        const strangerPostId = await createPostAs(stranger.accessToken, 'a post I should not see');

        const page = await callUnary<ListHomeFeedRequest, ListHomeFeedResponse>(
          feeds.listHomeFeed.bind(feeds),
          { cursor: '', limit: 50 },
          { accessToken: viewer.accessToken },
        );
        const ids = page.posts.map((post) => post.id);
        expect(ids).toContain(ownPostId);
        expect(ids).toContain(followedPostId);
        expect(ids).not.toContain(strangerPostId);
      });

      it('excludes a muted followed actor (§63)', async () => {
        const viewer = await registerTestActor(auth, dataSource, inviterUserId);
        const muted = await registerTestActor(auth, dataSource, inviterUserId);
        await createTestFollow(dataSource.manager, {
          followerActorId: viewer.actorId,
          followeeActorId: muted.actorId,
        });
        await createTestMute(dataSource.manager, {
          muterActorId: viewer.actorId,
          mutedActorId: muted.actorId,
        });

        const mutedPostId = await createPostAs(muted.accessToken, 'muted but still followed');

        const page = await callUnary<ListHomeFeedRequest, ListHomeFeedResponse>(
          feeds.listHomeFeed.bind(feeds),
          { cursor: '', limit: 50 },
          { accessToken: viewer.accessToken },
        );
        expect(page.posts.map((post) => post.id)).not.toContain(mutedPostId);
      });

      it('requires authentication', async () => {
        const error = await expectRejection<ListHomeFeedRequest, ListHomeFeedResponse>(
          feeds.listHomeFeed.bind(feeds),
          { cursor: '', limit: 20 },
        );
        expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
      });
    });

    async function createPostAs(accessToken: string, body: string): Promise<string> {
      const response = await callUnary<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        {
          clientRequestId: randomUUID(),
          body: `${body} ${testSuffix()}`,
          linkUrl: '',
          visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
          contentWarning: '',
          inReplyToId: '',
          mediaIds: [],
          quotedPostId: '',
          communityId: '',
          quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
        },
        { accessToken },
      );
      const id = response.post?.id;
      if (id === undefined) throw new Error('createPost did not return a post');
      return id;
    }
  },
);
