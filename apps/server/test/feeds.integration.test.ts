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
import { PostVisibility } from '@patches/proto/nest';
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
 * `FeedService` end-to-end over real gRPC against real PostgreSQL (spec §118–§119): chronological
 * keyset pagination (§46) with no duplicates/gaps across pages, the visibility filter seam
 * (`FOLLOWERS`-only posts never appear in a list view yet — spec §59), and `ListHomeFeed`'s
 * honest `NOT_IMPLEMENTED`.
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
          inReplyToId: '',
          mediaIds: [],
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
              inReplyToId: '',
              mediaIds: [],
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
            inReplyToId: '',
            mediaIds: [],
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
            inReplyToId: '',
            mediaIds: [],
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
    });

    describe('ListHomeFeed', () => {
      it('returns UNIMPLEMENTED rather than an invented "own posts" feed (§59)', async () => {
        const error = await expectRejection<ListHomeFeedRequest, ListHomeFeedResponse>(
          feeds.listHomeFeed.bind(feeds),
          { cursor: '', limit: 20 },
        );
        expect(error.code).toBe(GrpcStatus.UNIMPLEMENTED);
      });
    });
  },
);
