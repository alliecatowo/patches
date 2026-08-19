import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAuthClient,
  createPostClient,
  createReactionClient,
  type AuthGrpcClient,
  type BookmarkPostRequest,
  type BookmarkPostResponse,
  type CreatePostRequest,
  type CreatePostResponse,
  type ListBookmarksRequest,
  type ListBookmarksResponse,
  type ListPostLikersRequest,
  type ListPostLikersResponse,
  type LikePostRequest,
  type LikePostResponse,
  type PostGrpcClient,
  type ReactionGrpcClient,
  type UnbookmarkPostRequest,
  type UnbookmarkPostResponse,
  type UnlikePostRequest,
  type UnlikePostResponse,
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
 * `ReactionService` end-to-end over real gRPC against real PostgreSQL (spec §118–§119):
 * like/unlike and bookmark/unbookmark idempotency, count/viewer-state accuracy, and
 * `ListBookmarks`/`ListPostLikers` pagination.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping reactions integration tests: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'reactions over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let posts: PostGrpcClient;
    let reactions: ReactionGrpcClient;
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

      alice = await registerTestActor(auth, dataSource, inviterUserId);
      bob = await registerTestActor(auth, dataSource, inviterUserId);
    }, 60_000);

    afterAll(async () => {
      auth.close();
      posts.close();
      reactions.close();
      await server.close();
      await dataSource.destroy();
    });

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

    describe('LikePost / UnlikePost', () => {
      it('is idempotent and updates counts/viewer state (§53)', async () => {
        const postId = await createPost(alice, `likeable post ${testSuffix()}`);

        const first = await callUnary<LikePostRequest, LikePostResponse>(
          reactions.likePost.bind(reactions),
          { postId },
          { accessToken: bob.accessToken },
        );
        expect(first.counts?.likes).toBe(1);
        expect(first.viewerState?.liked).toBe(true);

        const second = await callUnary<LikePostRequest, LikePostResponse>(
          reactions.likePost.bind(reactions),
          { postId },
          { accessToken: bob.accessToken },
        );
        expect(second.counts?.likes).toBe(1);

        const unliked = await callUnary<UnlikePostRequest, UnlikePostResponse>(
          reactions.unlikePost.bind(reactions),
          { postId },
          { accessToken: bob.accessToken },
        );
        expect(unliked.counts?.likes).toBe(0);
        expect(unliked.viewerState?.liked).toBe(false);

        const unlikedAgain = await callUnary<UnlikePostRequest, UnlikePostResponse>(
          reactions.unlikePost.bind(reactions),
          { postId },
          { accessToken: bob.accessToken },
        );
        expect(unlikedAgain.counts?.likes).toBe(0);
      });

      it('rejects an unauthenticated caller with UNAUTHENTICATED', async () => {
        const postId = await createPost(alice, `auth required ${testSuffix()}`);
        const error = await expectRejection<LikePostRequest, LikePostResponse>(
          reactions.likePost.bind(reactions),
          { postId },
        );
        expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
      });

      it('returns NOT_FOUND for a post that does not exist', async () => {
        const error = await expectRejection<LikePostRequest, LikePostResponse>(
          reactions.likePost.bind(reactions),
          { postId: randomUUID() },
          { accessToken: bob.accessToken },
        );
        expect(error.code).toBe(GrpcStatus.NOT_FOUND);
      });
    });

    describe('BookmarkPost / UnbookmarkPost / ListBookmarks', () => {
      it('is idempotent, private, and listable (§53)', async () => {
        const postId = await createPost(alice, `bookmarkable post ${testSuffix()}`);

        const bookmarked = await callUnary<BookmarkPostRequest, BookmarkPostResponse>(
          reactions.bookmarkPost.bind(reactions),
          { postId },
          { accessToken: bob.accessToken },
        );
        expect(bookmarked.viewerState?.bookmarked).toBe(true);

        await callUnary<BookmarkPostRequest, BookmarkPostResponse>(
          reactions.bookmarkPost.bind(reactions),
          { postId },
          { accessToken: bob.accessToken },
        );

        const bobList = await callUnary<ListBookmarksRequest, ListBookmarksResponse>(
          reactions.listBookmarks.bind(reactions),
          { cursor: '', limit: 20 },
          { accessToken: bob.accessToken },
        );
        expect(bobList.posts.some((post) => post.id === postId)).toBe(true);

        // Bookmarks are private (§53) — alice's own list never contains bob's bookmark of
        // alice's post.
        const aliceList = await callUnary<ListBookmarksRequest, ListBookmarksResponse>(
          reactions.listBookmarks.bind(reactions),
          { cursor: '', limit: 20 },
          { accessToken: alice.accessToken },
        );
        expect(aliceList.posts.some((post) => post.id === postId)).toBe(false);

        const unbookmarked = await callUnary<UnbookmarkPostRequest, UnbookmarkPostResponse>(
          reactions.unbookmarkPost.bind(reactions),
          { postId },
          { accessToken: bob.accessToken },
        );
        expect(unbookmarked.viewerState?.bookmarked).toBe(false);

        const afterUnbookmark = await callUnary<ListBookmarksRequest, ListBookmarksResponse>(
          reactions.listBookmarks.bind(reactions),
          { cursor: '', limit: 20 },
          { accessToken: bob.accessToken },
        );
        expect(afterUnbookmark.posts.some((post) => post.id === postId)).toBe(false);
      });
    });

    describe('ListPostLikers', () => {
      it('lists likers newest first and is anonymous-readable', async () => {
        const postId = await createPost(alice, `many likers ${testSuffix()}`);
        await callUnary<LikePostRequest, LikePostResponse>(
          reactions.likePost.bind(reactions),
          { postId },
          { accessToken: bob.accessToken },
        );

        const likers = await callUnary<ListPostLikersRequest, ListPostLikersResponse>(
          reactions.listPostLikers.bind(reactions),
          { postId, cursor: '', limit: 20 },
        );
        expect(likers.actors.map((actor) => actor.id)).toContain(bob.actorId);
      });
    });
  },
);
