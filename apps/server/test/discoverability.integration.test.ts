import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials } from '@grpc/grpc-js';
import {
  createActorClient,
  createAuthClient,
  createFeedClient,
  createPostClient,
  createPrivacyClient,
  type ActorGrpcClient,
  type AuthGrpcClient,
  type CreatePostRequest,
  type CreatePostResponse,
  type FeedGrpcClient,
  type GetActorByHandleRequest,
  type GetActorByHandleResponse,
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type PostGrpcClient,
  type PrivacyGrpcClient,
  type SearchActorsRequest,
  type SearchActorsResponse,
  type SearchPostsRequest,
  type SearchPostsResponse,
  type UpdatePrivacyPrefsRequest,
  type UpdatePrivacyPrefsResponse,
} from '@patches/proto';
import { PostVisibility, QuotePolicy } from '@patches/proto/nest';
import { createTestFollow, createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { registerTestActor, testSuffix, type TestActor } from './support/fixtures.js';
import { callUnary, startTestServer, type TestServer } from './support/test-server.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping discoverability integration tests: TEST_DATABASE_URL is not set ' +
      '(start Postgres with `mise run compose -- up -d`).',
  );
}

/**
 * Enforcement of the stored discoverability prefs (`INITIAL_VISION.md` §197.5): the
 * `actor_privacy_prefs` row is written by `PrivacyService.UpdatePrivacyPrefs` (covered by
 * `privacy.integration.test.ts`) but was, until P14-029, never read by anything. This file
 * covers the read side — `ActorService.SearchActors`, `PostService.SearchPosts`, and
 * `FeedService.ListLocalFeed` — via `apps/server/src/modules/privacy/discoverability.ts`.
 */
describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'discoverability prefs enforcement over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let actorsClient: ActorGrpcClient;
    let posts: PostGrpcClient;
    let feeds: FeedGrpcClient;
    let privacy: PrivacyGrpcClient;
    let inviterUserId: string;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `inviter${testSuffix()}`,
      });
      inviterUserId = user.id;

      server = await startTestServer();
      const insecure = grpcCredentials.createInsecure();
      auth = createAuthClient(server.url, insecure);
      actorsClient = createActorClient(server.url, insecure);
      posts = createPostClient(server.url, insecure);
      feeds = createFeedClient(server.url, insecure);
      privacy = createPrivacyClient(server.url, insecure);
    }, 60_000);

    afterAll(async () => {
      auth.close();
      actorsClient.close();
      posts.close();
      feeds.close();
      privacy.close();
      await server.close();
      await dataSource.destroy();
    });

    async function freshActor(): Promise<TestActor> {
      return registerTestActor(auth, dataSource, inviterUserId);
    }

    /** `@grpc/proto-loader`'s literal wire shape for `google.protobuf.FieldMask` is
     * `{ paths: string[] }`, not the flat `string[]` ts-proto's generated
     * `UpdatePrivacyPrefsRequest.updateMask` type claims (LEARNINGS: proto-fieldmask-wire-
     * shape; mirrors `privacy.integration.test.ts`'s identical helper). */
    function fieldMask(paths: string[]): UpdatePrivacyPrefsRequest['updateMask'] {
      return { paths } as unknown as UpdatePrivacyPrefsRequest['updateMask'];
    }

    async function setPref(
      actor: TestActor,
      path: 'discoverable' | 'indexable' | 'show_in_local_feed',
      value: boolean,
    ): Promise<void> {
      const camel = path === 'show_in_local_feed' ? 'showInLocalFeed' : path;
      await callUnary<UpdatePrivacyPrefsRequest, UpdatePrivacyPrefsResponse>(
        privacy.updatePrivacyPrefs.bind(privacy),
        { [camel]: value, updateMask: fieldMask([path]) } as unknown as UpdatePrivacyPrefsRequest,
        { accessToken: actor.accessToken },
      );
    }

    async function createPostAs(actor: TestActor, body: string): Promise<string> {
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
        { accessToken: actor.accessToken },
      );
      const id = response.post?.id;
      if (id === undefined) throw new Error('createPost did not return a post');
      return id;
    }

    describe('discoverable', () => {
      it('removes the actor from SearchActors, on and off', async () => {
        const prefix = `disc${testSuffix()}`;
        const actor = await registerTestActor(auth, dataSource, inviterUserId, {
          handle: prefix,
          displayName: 'Discoverability Target',
        });

        const before = await callUnary<SearchActorsRequest, SearchActorsResponse>(
          actorsClient.searchActors.bind(actorsClient),
          { query: prefix, cursor: '', limit: 10 },
        );
        expect(before.actors.map((a) => a.id)).toContain(actor.actorId);

        await setPref(actor, 'discoverable', false);

        const whileOff = await callUnary<SearchActorsRequest, SearchActorsResponse>(
          actorsClient.searchActors.bind(actorsClient),
          { query: prefix, cursor: '', limit: 10 },
        );
        expect(whileOff.actors.map((a) => a.id)).not.toContain(actor.actorId);

        await setPref(actor, 'discoverable', true);

        const backOn = await callUnary<SearchActorsRequest, SearchActorsResponse>(
          actorsClient.searchActors.bind(actorsClient),
          { query: prefix, cursor: '', limit: 10 },
        );
        expect(backOn.actors.map((a) => a.id)).toContain(actor.actorId);
      });

      it('exact-handle resolution still works while undiscoverable (§197.5)', async () => {
        const actor = await freshActor();
        await setPref(actor, 'discoverable', false);

        const response = await callUnary<GetActorByHandleRequest, GetActorByHandleResponse>(
          actorsClient.getActorByHandle.bind(actorsClient),
          { handle: actor.handle },
        );
        expect(response.actor?.id).toBe(actor.actorId);
      });
    });

    describe('indexable', () => {
      it('excludes the actor posts from SearchPosts, on and off', async () => {
        const actor = await freshActor();
        const needle = `kumquat${testSuffix()}`;
        const postId = await createPostAs(actor, `I bought a ${needle} today`);

        const before = await callUnary<SearchPostsRequest, SearchPostsResponse>(
          posts.searchPosts.bind(posts),
          { query: needle, cursor: '', limit: 20, authorHandle: '', includeReplies: false },
        );
        expect(before.posts.map((post) => post.id)).toEqual([postId]);

        await setPref(actor, 'indexable', false);

        const whileOff = await callUnary<SearchPostsRequest, SearchPostsResponse>(
          posts.searchPosts.bind(posts),
          { query: needle, cursor: '', limit: 20, authorHandle: '', includeReplies: false },
        );
        expect(whileOff.posts.map((post) => post.id)).toEqual([]);

        await setPref(actor, 'indexable', true);

        const backOn = await callUnary<SearchPostsRequest, SearchPostsResponse>(
          posts.searchPosts.bind(posts),
          { query: needle, cursor: '', limit: 20, authorHandle: '', includeReplies: false },
        );
        expect(backOn.posts.map((post) => post.id)).toEqual([postId]);
      });
    });

    describe('show_in_local_feed', () => {
      it('keeps the actor posts off ListLocalFeed but a follower still sees them on their home feed', async () => {
        const author = await freshActor();
        const follower = await freshActor();
        await createTestFollow(dataSource.manager, {
          followerActorId: follower.actorId,
          followeeActorId: author.actorId,
        });

        await setPref(author, 'show_in_local_feed', false);
        const postId = await createPostAs(author, `local feed opt-out ${testSuffix()}`);

        const localPage = await callUnary<ListLocalFeedRequest, ListLocalFeedResponse>(
          feeds.listLocalFeed.bind(feeds),
          { cursor: '', limit: 50 },
        );
        expect(localPage.posts.map((post) => post.id)).not.toContain(postId);

        const homePage = await callUnary<ListHomeFeedRequest, ListHomeFeedResponse>(
          feeds.listHomeFeed.bind(feeds),
          { cursor: '', limit: 50 },
          { accessToken: follower.accessToken },
        );
        expect(homePage.posts.map((post) => post.id)).toContain(postId);

        await setPref(author, 'show_in_local_feed', true);
        const backOnPage = await callUnary<ListLocalFeedRequest, ListLocalFeedResponse>(
          feeds.listLocalFeed.bind(feeds),
          { cursor: '', limit: 50 },
        );
        expect(backOnPage.posts.map((post) => post.id)).toContain(postId);
      });
    });
  },
);
