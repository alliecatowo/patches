import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAuthClient,
  createModerationClient,
  createPostClient,
  type AuthGrpcClient,
  type BlockActorRequest,
  type BlockActorResponse,
  type CreatePostRequest,
  type CreatePostResponse,
  type DeletePostRequest,
  type DeletePostResponse,
  type GetPostRequest,
  type GetPostResponse,
  type ListRepliesRequest,
  type ListRepliesResponse,
  type ModerationGrpcClient,
  type PostGrpcClient,
  type SearchPostsRequest,
  type SearchPostsResponse,
} from '@patches/proto';
import { PostVisibility, QuotePolicy } from '@patches/proto/nest';
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
 * `PostService` end-to-end over real gRPC against real PostgreSQL (spec §118–§119): create →
 * get → delete, idempotency on `client_request_id` (§45), tombstoning (§25), ownership, and
 * `ListReplies`' cursor pagination.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping posts integration tests: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'posts over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let posts: PostGrpcClient;
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
      moderation = createModerationClient(server.url, grpcCredentials.createInsecure());

      alice = await registerTestActor(auth, dataSource, inviterUserId);
      bob = await registerTestActor(auth, dataSource, inviterUserId);
    }, 60_000);

    afterAll(async () => {
      auth.close();
      posts.close();
      moderation.close();
      await server.close();
      await dataSource.destroy();
    });

    function createPostRequest(overrides: Partial<CreatePostRequest> = {}): CreatePostRequest {
      return {
        clientRequestId: randomUUID(),
        body: `hello from an integration test ${testSuffix()}`,
        linkUrl: '',
        visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
        contentWarning: '',
        inReplyToId: '',
        mediaIds: [],
        quotedPostId: '',
        communityId: '',
        quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
        ...overrides,
      };
    }

    // ------------------------------------------------------------------ CreatePost

    describe('CreatePost', () => {
      it('creates a post owned by the caller (§23)', async () => {
        const response = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: 'my very first post' }),
          { accessToken: alice.accessToken },
        );

        expect(response.post?.body).toBe('my very first post');
        expect(response.post?.author?.id).toBe(alice.actorId);
        expect(response.post?.visibility).toBe(PostVisibility.POST_VISIBILITY_PUBLIC);
        expect(response.post?.deleted).toBe(false);
        expect(response.post?.rootPostId).toBe(response.post?.id);
        expect(response.post?.counts?.replies).toBe(0);
      });

      it('rejects an unauthenticated caller with UNAUTHENTICATED', async () => {
        const error = await expectRejection<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest(),
        );
        expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
      });

      it('rejects a post with no text, link, or media (§23)', async () => {
        const error = await expectRejection<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: '' }),
          { accessToken: alice.accessToken },
        );
        expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      });

      it('rejects a media id that does not exist', async () => {
        const error = await expectRejection<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: '', mediaIds: [randomUUID()] }),
          { accessToken: alice.accessToken },
        );
        expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      });

      it('is idempotent on (author_actor_id, client_request_id) (§45)', async () => {
        const request = createPostRequest({ body: 'retry me' });

        const first = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          request,
          { accessToken: alice.accessToken },
        );
        const second = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          request,
          { accessToken: alice.accessToken },
        );

        expect(second.post?.id).toBe(first.post?.id);
        expect(second.post?.createdAt).toEqual(first.post?.createdAt);
      });

      it("replying inherits the parent thread's root_post_id (§24)", async () => {
        const root = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: 'a thread starts here' }),
          { accessToken: alice.accessToken },
        );
        const rootId = root.post?.id ?? '';

        const reply = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: 'a reply', inReplyToId: rootId }),
          { accessToken: bob.accessToken },
        );

        expect(reply.post?.inReplyToId).toBe(rootId);
        expect(reply.post?.rootPostId).toBe(rootId);
      });
    });

    // ------------------------------------------------------------------ GetPost

    describe('GetPost', () => {
      it('is readable anonymously', async () => {
        const created = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: 'anyone can read this' }),
          { accessToken: alice.accessToken },
        );

        const fetched = await callUnary<GetPostRequest, GetPostResponse>(
          posts.getPost.bind(posts),
          {
            id: created.post?.id ?? '',
          },
        );
        expect(fetched.post?.body).toBe('anyone can read this');
      });

      it('returns NOT_FOUND for an id that never existed', async () => {
        const error = await expectRejection<GetPostRequest, GetPostResponse>(
          posts.getPost.bind(posts),
          {
            id: randomUUID(),
          },
        );
        expect(error.code).toBe(GrpcStatus.NOT_FOUND);
      });
    });

    // ------------------------------------------------------------------ DeletePost

    describe('DeletePost', () => {
      it('tombstones the post instead of NOT_FOUND on a subsequent GetPost (§25)', async () => {
        const created = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: 'about to be deleted' }),
          { accessToken: alice.accessToken },
        );
        const id = created.post?.id ?? '';

        const deleted = await callUnary<DeletePostRequest, DeletePostResponse>(
          posts.deletePost.bind(posts),
          { id },
          { accessToken: alice.accessToken },
        );
        expect(deleted.post?.deleted).toBe(true);
        expect(deleted.post?.body).toBe('');

        const fetched = await callUnary<GetPostRequest, GetPostResponse>(
          posts.getPost.bind(posts),
          {
            id,
          },
        );
        expect(fetched.post?.deleted).toBe(true);
        expect(fetched.post?.body).toBe('');
      });

      it('is idempotent when the post is already deleted', async () => {
        const created = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: 'delete me twice' }),
          { accessToken: alice.accessToken },
        );
        const id = created.post?.id ?? '';

        await callUnary<DeletePostRequest, DeletePostResponse>(
          posts.deletePost.bind(posts),
          { id },
          {
            accessToken: alice.accessToken,
          },
        );
        const second = await callUnary<DeletePostRequest, DeletePostResponse>(
          posts.deletePost.bind(posts),
          { id },
          { accessToken: alice.accessToken },
        );
        expect(second.post?.deleted).toBe(true);
      });

      it("refuses to delete another actor's post with PERMISSION_DENIED", async () => {
        const created = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: 'not yours' }),
          { accessToken: alice.accessToken },
        );

        const error = await expectRejection<DeletePostRequest, DeletePostResponse>(
          posts.deletePost.bind(posts),
          { id: created.post?.id ?? '' },
          { accessToken: bob.accessToken },
        );
        expect(error.code).toBe(GrpcStatus.PERMISSION_DENIED);
      });
    });

    // ------------------------------------------------------------------ ListReplies

    describe('ListReplies', () => {
      it('paginates direct replies with no duplicates or gaps across pages', async () => {
        const root = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: 'a thread with several replies' }),
          { accessToken: alice.accessToken },
        );
        const rootId = root.post?.id ?? '';

        const replyIds: string[] = [];
        for (let index = 0; index < 3; index += 1) {
          const reply = await callUnary<CreatePostRequest, CreatePostResponse>(
            posts.createPost.bind(posts),
            createPostRequest({ body: `reply ${String(index)}`, inReplyToId: rootId }),
            { accessToken: bob.accessToken },
          );
          replyIds.push(reply.post?.id ?? '');
        }

        const seen: string[] = [];
        let cursor = '';
        for (let guard = 0; guard < 10; guard += 1) {
          const page = await callUnary<ListRepliesRequest, ListRepliesResponse>(
            posts.listReplies.bind(posts),
            { postId: rootId, cursor, limit: 1, maxDepth: 0 },
          );
          seen.push(...page.posts.map((post) => post.id));
          if (!page.page?.hasMore) break;
          cursor = page.page?.nextCursor ?? '';
        }

        expect(seen).toHaveLength(3);
        expect(new Set(seen).size).toBe(3);
        expect(seen.sort()).toEqual([...replyIds].sort());
      });

      it('walks nested replies up to max_depth and no further (§24)', async () => {
        const root = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: 'a deep thread' }),
          { accessToken: alice.accessToken },
        );
        const rootId = root.post?.id ?? '';

        const level1 = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: 'level 1', inReplyToId: rootId }),
          { accessToken: bob.accessToken },
        );
        const level1Id = level1.post?.id ?? '';

        const level2 = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: 'level 2', inReplyToId: level1Id }),
          { accessToken: alice.accessToken },
        );
        const level2Id = level2.post?.id ?? '';

        expect(level2.post?.rootPostId).toBe(rootId);

        const shallow = await callUnary<ListRepliesRequest, ListRepliesResponse>(
          posts.listReplies.bind(posts),
          { postId: rootId, cursor: '', limit: 10, maxDepth: 1 },
        );
        expect(shallow.posts.map((post) => post.id)).toEqual([level1Id]);

        const deep = await callUnary<ListRepliesRequest, ListRepliesResponse>(
          posts.listReplies.bind(posts),
          { postId: rootId, cursor: '', limit: 10, maxDepth: 2 },
        );
        expect(new Set(deep.posts.map((post) => post.id))).toEqual(new Set([level1Id, level2Id]));
      });
    });

    // ------------------------------------------------------------------ SearchPosts

    describe('SearchPosts', () => {
      it('matches on body text and excludes non-matching posts (§194)', async () => {
        const needle = `xylophone${testSuffix()}`;
        const matching = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: `I bought a ${needle} today` }),
          { accessToken: alice.accessToken },
        );
        await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: `unrelated post ${testSuffix()}` }),
          { accessToken: alice.accessToken },
        );

        const result = await callUnary<SearchPostsRequest, SearchPostsResponse>(
          posts.searchPosts.bind(posts),
          { query: needle, cursor: '', limit: 20, authorHandle: '', includeReplies: false },
        );
        expect(result.posts.map((post) => post.id)).toEqual([matching.post?.id]);
      });

      it('rejects an empty or whitespace-only query with INVALID_ARGUMENT', async () => {
        const error = await expectRejection<SearchPostsRequest, SearchPostsResponse>(
          posts.searchPosts.bind(posts),
          { query: '   ', cursor: '', limit: 20, authorHandle: '', includeReplies: false },
        );
        expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      });

      it('excludes replies unless include_replies is set', async () => {
        const needle = `marmalade${testSuffix()}`;
        const root = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: `${needle} root` }),
          { accessToken: alice.accessToken },
        );
        const reply = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: `${needle} reply`, inReplyToId: root.post?.id ?? '' }),
          { accessToken: bob.accessToken },
        );

        const withoutReplies = await callUnary<SearchPostsRequest, SearchPostsResponse>(
          posts.searchPosts.bind(posts),
          { query: needle, cursor: '', limit: 20, authorHandle: '', includeReplies: false },
        );
        expect(withoutReplies.posts.map((post) => post.id)).toEqual([root.post?.id]);

        const withReplies = await callUnary<SearchPostsRequest, SearchPostsResponse>(
          posts.searchPosts.bind(posts),
          { query: needle, cursor: '', limit: 20, authorHandle: '', includeReplies: true },
        );
        expect(new Set(withReplies.posts.map((post) => post.id))).toEqual(
          new Set([root.post?.id, reply.post?.id]),
        );
      });

      it('filters by author_handle', async () => {
        const needle = `dandelion${testSuffix()}`;
        const alicePost = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: `${needle} from alice` }),
          { accessToken: alice.accessToken },
        );
        await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: `${needle} from bob` }),
          { accessToken: bob.accessToken },
        );

        const result = await callUnary<SearchPostsRequest, SearchPostsResponse>(
          posts.searchPosts.bind(posts),
          {
            query: needle,
            cursor: '',
            limit: 20,
            authorHandle: alice.handle,
            includeReplies: false,
          },
        );
        expect(result.posts.map((post) => post.id)).toEqual([alicePost.post?.id]);
      });

      it('anonymous callers never see a FOLLOWERS-only match (§62)', async () => {
        const needle = `elderberry${testSuffix()}`;
        await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({
            body: `${needle} followers-only`,
            visibility: PostVisibility.POST_VISIBILITY_FOLLOWERS,
          }),
          { accessToken: alice.accessToken },
        );

        const anonymous = await callUnary<SearchPostsRequest, SearchPostsResponse>(
          posts.searchPosts.bind(posts),
          { query: needle, cursor: '', limit: 20, authorHandle: '', includeReplies: false },
        );
        expect(anonymous.posts).toHaveLength(0);
      });

      it("excludes a blocked-either-direction author's posts (§62)", async () => {
        const needle = `foxglove${testSuffix()}`;
        const carol = await registerTestActor(auth, dataSource, inviterUserId);

        await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          createPostRequest({ body: `${needle} from carol` }),
          { accessToken: carol.accessToken },
        );

        await callUnary<BlockActorRequest, BlockActorResponse>(
          moderation.blockActor.bind(moderation),
          { actorId: carol.actorId },
          { accessToken: alice.accessToken },
        );

        const asAlice = await callUnary<SearchPostsRequest, SearchPostsResponse>(
          posts.searchPosts.bind(posts),
          { query: needle, cursor: '', limit: 20, authorHandle: '', includeReplies: false },
          { accessToken: alice.accessToken },
        );
        expect(asAlice.posts).toHaveLength(0);

        // Unauthenticated reads are unaffected by anyone's blocks.
        const anonymous = await callUnary<SearchPostsRequest, SearchPostsResponse>(
          posts.searchPosts.bind(posts),
          { query: needle, cursor: '', limit: 20, authorHandle: '', includeReplies: false },
        );
        expect(anonymous.posts).toHaveLength(1);
      });

      it('keyset-paginates newest-first with no duplicates or gaps', async () => {
        const needle = `honeysuckle${testSuffix()}`;
        const ids: string[] = [];
        for (let index = 0; index < 3; index += 1) {
          const created = await callUnary<CreatePostRequest, CreatePostResponse>(
            posts.createPost.bind(posts),
            createPostRequest({ body: `${needle} number ${String(index)}` }),
            { accessToken: alice.accessToken },
          );
          ids.push(created.post?.id ?? '');
        }

        const seen: string[] = [];
        let cursor = '';
        for (let guard = 0; guard < 10; guard += 1) {
          const page = await callUnary<SearchPostsRequest, SearchPostsResponse>(
            posts.searchPosts.bind(posts),
            { query: needle, cursor, limit: 1, authorHandle: '', includeReplies: false },
          );
          seen.push(...page.posts.map((post) => post.id));
          if (!page.page?.hasMore) break;
          cursor = page.page?.nextCursor ?? '';
        }

        expect(seen).toHaveLength(3);
        expect(new Set(seen).size).toBe(3);
        // Newest first: the most recently created id comes back first.
        expect(seen[0]).toBe(ids[2]);
        expect(seen.sort()).toEqual([...ids].sort());
      });
    });
  },
);
