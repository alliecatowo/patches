import { randomUUID } from 'node:crypto';

import { createTestUser } from '@patches/testkit';
import {
  FOLLOW_STATE,
  type CreatePostRequest,
  type CreatePostResponse,
  type DeletePostRequest,
  type DeletePostResponse,
  type FollowActorRequest,
  type FollowActorResponse,
  type GetRelationshipRequest,
  type GetRelationshipResponse,
  type GetPostRequest,
  type GetPostResponse,
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListTagFeedRequest,
  type ListTagFeedResponse,
  type RepostPostRequest,
  type RepostPostResponse,
  type UnrepostPostRequest,
  type UnrepostPostResponse,
} from '@patches/proto';
import { PostVisibility, QuotePolicy } from '@patches/proto/nest';
import {
  federationDeliverPayloadSchema,
  OutboxJob,
  Post,
  QuoteAuthorization,
  Repost,
} from '@patches/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { localRepostAnnounceUri } from '../src/modules/federation/activity-ids.js';
import { discoverRemoteActor } from './support/federation-discovery.js';
import { drainFederationDeliveries } from './support/federation-relay.js';
import { startFederationNode, type FederationTestNode } from './support/federation-node.js';
import { mintInvite, registerTestActor, testSuffix } from './support/fixtures.js';
import { callUnary } from './support/test-server.js';

/**
 * P8-008: two full Patches nodes, each a real separate OS process running the built `dist/
 * main.js` (`federation-node.ts`'s doc comment explains why a real process, not an in-process
 * `NestFactory.create`), prove `Follow` -> `Accept`, `Create(Note)` propagation into
 * `ListHomeFeed`, and `Delete` -> tombstone, entirely over real HTTP (loopback) with real
 * HTTP-Signature-signed requests — the "Patches-to-Patches" Stage F1 goal (`docs/architecture/
 * federation.md` §4). `drainFederationDeliveries` stands in for `apps/worker`'s `JobRunner`,
 * driving `FEDERATION_DELIVER` jobs inline rather than polling (P8-008's "job runner driving
 * FEDERATION_DELIVER inline").
 *
 * Requires `pnpm --filter @patches/server build` to have run first (a fresh `apps/server/
 * dist/main.js`) — skips with a clear message if it's missing, same spirit as skipping
 * without `TEST_DATABASE_URL`.
 *
 * P18-008 adds three more round trips over the same two nodes (`docs/operations/
 * federation.md`'s "Two-node lab (P18-008)" has a real captured transcript of this suite
 * passing): repost/unrepost `Announce`/`Undo(Announce)` id stability across an actual OS-
 * process restart of the announcing node (proves reconstruction from the `reposts` row, not
 * memoization — the B-079 regression class), a federated post's `Hashtag` tags landing in the
 * receiving node's local tag feed, and a quote of a remote post plus a local-from-remote quote
 * each recording a `quote_authorizations` row (P18-007).
 */

const primaryUrl = process.env.TEST_DATABASE_URL;
const fedBUrl =
  process.env.TEST_DATABASE_URL_FED_B ??
  (primaryUrl !== undefined ? primaryUrl.replace(/\/[^/]+$/, '/patches_test_fed_b') : undefined);

if (primaryUrl === undefined || primaryUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping two-node federation integration test: TEST_DATABASE_URL is not set.',
  );
}

/** Registers a fresh invite-bearing account on `node` — every P18-008 example needs its own
 * actors, uniquely suffixed so concurrent examples never collide on a handle. */
async function registerFreshActor(node: FederationTestNode, label: string) {
  const { user: inviter } = await createTestUser(node.dataSource.manager, {
    handle: `inviter-${label}-${testSuffix()}`,
  });
  return registerTestActor(node.auth, node.dataSource, inviter.id, {
    handle: `${label}${testSuffix()}`,
    inviteCode: await mintInvite(node.dataSource, inviter.id),
  });
}

/** `follower` follows `followeeActorId` (an actor row already discovered on `follower`'s own
 * node) and drains both the outbound `Follow` and the auto-`Accept` it triggers. */
async function followAndAccept(
  follower: FederationTestNode,
  followee: FederationTestNode,
  followerToken: string,
  followeeActorId: string,
): Promise<void> {
  await callUnary<FollowActorRequest, FollowActorResponse>(
    follower.graph.followActor.bind(follower.graph),
    { actorId: followeeActorId },
    { accessToken: followerToken },
  );
  expect(
    await drainFederationDeliveries(
      follower.dataSource,
      undefined,
      follower.federationKeyEncryptionKey,
    ),
  ).toBeGreaterThan(0);
  expect(
    await drainFederationDeliveries(
      followee.dataSource,
      undefined,
      followee.federationKeyEncryptionKey,
    ),
  ).toBeGreaterThan(0);
}

/** Creates a post on `author`'s node, drains its outbound `Create(Note)` delivery, and
 * asserts at least one delivery went out — every P18-008 example that calls this has a
 * remote follower waiting to receive it. */
async function createAndDeliverPost(
  author: FederationTestNode,
  authorToken: string,
  overrides: Partial<CreatePostRequest>,
): Promise<CreatePostResponse> {
  const created = await callUnary<CreatePostRequest, CreatePostResponse>(
    author.posts.createPost.bind(author.posts),
    {
      body: '',
      linkUrl: '',
      visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
      contentWarning: '',
      inReplyToId: '',
      mediaIds: [],
      clientRequestId: randomUUID(),
      quotedPostId: '',
      communityId: '',
      quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
      ...overrides,
    },
    { accessToken: authorToken },
  );
  expect(
    await drainFederationDeliveries(
      author.dataSource,
      undefined,
      author.federationKeyEncryptionKey,
    ),
  ).toBeGreaterThan(0);
  return created;
}

describe.skipIf(primaryUrl === undefined || primaryUrl.length === 0)(
  'two-node federation lab (P8-008, integration)',
  () => {
    let nodeA: FederationTestNode;
    let nodeB: FederationTestNode;

    beforeAll(async () => {
      // Sequential, not `Promise.all` — each node needs its own free ports resolved and its
      // own database migrated before the next one starts, and interleaving the two child-
      // process boots buys nothing since `startFederationNode` already awaits full readiness.
      nodeA = await startFederationNode({
        databaseUrl: primaryUrl as string,
        nodeDomain: 'a.test',
      });
      nodeB = await startFederationNode({ databaseUrl: fedBUrl as string, nodeDomain: 'b.test' });
    }, 60_000);

    afterAll(async () => {
      await nodeA?.close();
      await nodeB?.close();
    });

    it('alice@A follows bob@B, bob auto-accepts, bob posts, alice sees it, bob deletes it', async () => {
      const { user: inviterA } = await createTestUser(nodeA.dataSource.manager, {
        handle: 'inviter-a',
      });
      const { user: inviterB } = await createTestUser(nodeB.dataSource.manager, {
        handle: 'inviter-b',
      });

      const alice = await registerTestActor(nodeA.auth, nodeA.dataSource, inviterA.id, {
        handle: 'alice',
        inviteCode: await mintInvite(nodeA.dataSource, inviterA.id),
      });
      const bob = await registerTestActor(nodeB.auth, nodeB.dataSource, inviterB.id, {
        handle: 'bob',
        inviteCode: await mintInvite(nodeB.dataSource, inviterB.id),
      });

      const hostB = new URL(nodeB.publicOrigin).host;
      const bobOnA = await discoverRemoteActor(nodeA.dataSource, 'bob', hostB);

      // --- Follow -> Accept ---------------------------------------------------------
      await callUnary<FollowActorRequest, FollowActorResponse>(
        nodeA.graph.followActor.bind(nodeA.graph),
        { actorId: bobOnA.id },
        { accessToken: alice.accessToken },
      );

      const deliveredFollow = await drainFederationDeliveries(
        nodeA.dataSource,
        undefined,
        nodeA.federationKeyEncryptionKey,
      );
      expect(deliveredFollow).toBeGreaterThan(0);

      // A-036: the delivered Follow must have bumped node B's `inbox_handled` counter —
      // `GET /federation/metrics` is loopback-only (`FederationMetricsController`), which this
      // request satisfies since both the test process and node B's HTTP listener are on
      // `127.0.0.1`.
      const metricsResponse = await fetch(`${nodeB.publicOrigin}/federation/metrics`);
      expect(metricsResponse.status).toBe(200);
      const metrics = (await metricsResponse.json()) as Record<string, number>;
      const domainA = new URL(nodeA.publicOrigin).host;
      expect(metrics[`inbox_handled{domain=${domainA},type=Follow}`]).toBeGreaterThan(0);

      const deliveredAccept = await drainFederationDeliveries(
        nodeB.dataSource,
        undefined,
        nodeB.federationKeyEncryptionKey,
      );
      expect(deliveredAccept).toBeGreaterThan(0);

      const relationship = await callUnary<GetRelationshipRequest, GetRelationshipResponse>(
        nodeA.graph.getRelationship.bind(nodeA.graph),
        { actorId: bobOnA.id },
        { accessToken: alice.accessToken },
      );
      expect(relationship.relationship?.state).toBe(FOLLOW_STATE.FOLLOWING);

      // --- Create(Note) propagation into ListHomeFeed --------------------------------
      const created = await callUnary<CreatePostRequest, CreatePostResponse>(
        nodeB.posts.createPost.bind(nodeB.posts),
        {
          body: 'hello from node B',
          linkUrl: '',
          visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
          contentWarning: '',
          inReplyToId: '',
          mediaIds: [],
          clientRequestId: randomUUID(),
          quotedPostId: '',
          communityId: '',
          quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
        },
        { accessToken: bob.accessToken },
      );
      expect(created.post?.id).toBeDefined();

      const deliveredCreate = await drainFederationDeliveries(
        nodeB.dataSource,
        undefined,
        nodeB.federationKeyEncryptionKey,
      );
      expect(deliveredCreate).toBeGreaterThan(0);

      const homeFeed = await callUnary<ListHomeFeedRequest, ListHomeFeedResponse>(
        nodeA.feeds.listHomeFeed.bind(nodeA.feeds),
        { cursor: '', limit: 20 },
        { accessToken: alice.accessToken },
      );
      const federatedPost = homeFeed.posts.find((post) => post.body === 'hello from node B');
      expect(federatedPost).toBeDefined();

      // --- Delete -> tombstone ---------------------------------------------------------
      await callUnary<DeletePostRequest, DeletePostResponse>(
        nodeB.posts.deletePost.bind(nodeB.posts),
        { id: created.post?.id ?? '' },
        { accessToken: bob.accessToken },
      );
      const deliveredDelete = await drainFederationDeliveries(
        nodeB.dataSource,
        undefined,
        nodeB.federationKeyEncryptionKey,
      );
      expect(deliveredDelete).toBeGreaterThan(0);

      const tombstoned = await nodeA.dataSource
        .getRepository(Post)
        .findOne({ where: { id: federatedPost?.id ?? '' } });
      expect(tombstoned?.deletedAt).not.toBeNull();
    }, 30_000);

    it('P18-008: repost/unrepost federates a stable-id Announce/Undo(Announce) across a process restart', async () => {
      const carol = await registerFreshActor(nodeA, 'carol');
      const dave = await registerFreshActor(nodeB, 'dave');

      const hostB = new URL(nodeB.publicOrigin).host;
      const daveOnA = await discoverRemoteActor(nodeA.dataSource, dave.handle, hostB);
      await followAndAccept(nodeA, nodeB, carol.accessToken, daveOnA.id);

      await createAndDeliverPost(nodeB, dave.accessToken, { body: 'a post worth reposting' });
      const homeFeed = await callUnary<ListHomeFeedRequest, ListHomeFeedResponse>(
        nodeA.feeds.listHomeFeed.bind(nodeA.feeds),
        { cursor: '', limit: 20 },
        { accessToken: carol.accessToken },
      );
      const federatedPost = homeFeed.posts.find((post) => post.body === 'a post worth reposting');
      expect(federatedPost).toBeDefined();
      const federatedPostId = federatedPost?.id ?? '';

      // --- repost -> Announce ----------------------------------------------------------
      await callUnary<RepostPostRequest, RepostPostResponse>(
        nodeA.reactions.repostPost.bind(nodeA.reactions),
        { postId: federatedPostId },
        { accessToken: carol.accessToken },
      );

      const repostRow = await nodeA.dataSource
        .getRepository(Repost)
        .findOneOrFail({ where: { actorId: carol.actorId, postId: federatedPostId } });
      // The regression this test exists to catch (B-079's class): the id the peer sees on
      // `Undo`'s inner object below must be exactly this one, reconstructed from the
      // `reposts` row — never a fresh id minted at undo time.
      const expectedAnnounceId = localRepostAnnounceUri(nodeA.publicOrigin, repostRow.id);

      const pendingAnnounce = await nodeA.dataSource
        .getRepository(OutboxJob)
        .find({ where: { type: 'FEDERATION_DELIVER', status: 'PENDING' }, order: { id: 'ASC' } });
      expect(pendingAnnounce.length).toBeGreaterThan(0);
      const announceActivity = federationDeliverPayloadSchema.parse(
        pendingAnnounce[pendingAnnounce.length - 1]?.payload,
      ).activity;
      expect(announceActivity.type).toBe('Announce');
      expect(announceActivity.id).toBe(expectedAnnounceId);

      expect(
        await drainFederationDeliveries(
          nodeA.dataSource,
          undefined,
          nodeA.federationKeyEncryptionKey,
        ),
      ).toBeGreaterThan(0);

      // Kill and respawn node A's OS process — a fresh process has an empty heap, so the
      // Undo's inner Announce id computed below cannot come from any in-process memoized
      // value; it can only come from re-reading the (still-persisted) `reposts` row.
      await nodeA.restart();

      // --- unrepost -> Undo(Announce), same inner id ------------------------------------
      await callUnary<UnrepostPostRequest, UnrepostPostResponse>(
        nodeA.reactions.unrepostPost.bind(nodeA.reactions),
        { postId: federatedPostId },
        { accessToken: carol.accessToken },
      );

      const repostRowAfterUnrepost = await nodeA.dataSource
        .getRepository(Repost)
        .findOne({ where: { actorId: carol.actorId, postId: federatedPostId } });
      expect(repostRowAfterUnrepost).toBeNull();

      const pendingUndo = await nodeA.dataSource
        .getRepository(OutboxJob)
        .find({ where: { type: 'FEDERATION_DELIVER', status: 'PENDING' }, order: { id: 'ASC' } });
      expect(pendingUndo.length).toBeGreaterThan(0);
      const undoActivity = federationDeliverPayloadSchema.parse(
        pendingUndo[pendingUndo.length - 1]?.payload,
      ).activity;
      expect(undoActivity.type).toBe('Undo');
      const undoneAnnounce = undoActivity.object as Record<string, unknown>;
      expect(undoneAnnounce.type).toBe('Announce');
      expect(undoneAnnounce.id).toBe(expectedAnnounceId);

      expect(
        await drainFederationDeliveries(
          nodeA.dataSource,
          undefined,
          nodeA.federationKeyEncryptionKey,
        ),
      ).toBeGreaterThan(0);
    }, 60_000);

    // P18-011: this lab caught a real ordering bug — `PostService.createPost`'s new-post
    // branch ran `this.federation.publishPost` before `this.tagExtraction.extractAndAttach`,
    // so `publishPost`'s `post_tags` read (P18-006) always saw zero rows and shipped a
    // tagless Note. Fixed by swapping the order in `post.service.ts`; this now asserts the
    // real (previously broken) behavior.
    it("P18-008: a federated post's Hashtag tags land in the local tag feed", async () => {
      const erin = await registerFreshActor(nodeA, 'erin');
      const frank = await registerFreshActor(nodeB, 'frank');

      const hostB = new URL(nodeB.publicOrigin).host;
      const frankOnA = await discoverRemoteActor(nodeA.dataSource, frank.handle, hostB);
      await followAndAccept(nodeA, nodeB, erin.accessToken, frankOnA.id);

      const tagName = `patcheslab${testSuffix()}`;
      const created = await createAndDeliverPost(nodeB, frank.accessToken, {
        body: `federation lab check #${tagName} today`,
      });

      const homeFeed = await callUnary<ListHomeFeedRequest, ListHomeFeedResponse>(
        nodeA.feeds.listHomeFeed.bind(nodeA.feeds),
        { cursor: '', limit: 20 },
        { accessToken: erin.accessToken },
      );
      // A federated post gets its own freshly-minted local id on ingestion (`handleCreate`),
      // never the origin's id — match on body, exactly as the P8-008 test above does.
      const federatedPost = homeFeed.posts.find((post) => post.body === created.post?.body);
      expect(federatedPost).toBeDefined();

      const tagFeed = await callUnary<ListTagFeedRequest, ListTagFeedResponse>(
        nodeA.feeds.listTagFeed.bind(nodeA.feeds),
        { tag: tagName, cursor: '', limit: 20 },
        { accessToken: erin.accessToken },
      );
      expect(tagFeed.posts.some((post) => post.id === federatedPost?.id)).toBe(true);
    }, 30_000);

    it('P18-008: a quote of a remote post and a local-from-remote quote each record a quote_authorizations row', async () => {
      const grace = await registerFreshActor(nodeA, 'grace');
      const henry = await registerFreshActor(nodeB, 'henry');

      const hostA = new URL(nodeA.publicOrigin).host;
      const hostB = new URL(nodeB.publicOrigin).host;
      const henryOnA = await discoverRemoteActor(nodeA.dataSource, henry.handle, hostB);
      const graceOnB = await discoverRemoteActor(nodeB.dataSource, grace.handle, hostA);
      // Mutual follow: each side's post must reach the other for both quote directions below.
      await followAndAccept(nodeA, nodeB, grace.accessToken, henryOnA.id);
      await followAndAccept(nodeB, nodeA, henry.accessToken, graceOnB.id);

      const henryPost = await createAndDeliverPost(nodeB, henry.accessToken, {
        body: "henry's original post",
      });
      const homeFeedA = await callUnary<ListHomeFeedRequest, ListHomeFeedResponse>(
        nodeA.feeds.listHomeFeed.bind(nodeA.feeds),
        { cursor: '', limit: 20 },
        { accessToken: grace.accessToken },
      );
      const henryPostOnA = homeFeedA.posts.find((post) => post.body === henryPost.post?.body);
      expect(henryPostOnA).toBeDefined();

      const gracePost = await createAndDeliverPost(nodeA, grace.accessToken, {
        body: "grace's original post",
      });
      const homeFeedB = await callUnary<ListHomeFeedRequest, ListHomeFeedResponse>(
        nodeB.feeds.listHomeFeed.bind(nodeB.feeds),
        { cursor: '', limit: 20 },
        { accessToken: henry.accessToken },
      );
      const gracePostOnB = homeFeedB.posts.find((post) => post.body === gracePost.post?.body);
      expect(gracePostOnB).toBeDefined();

      // --- Quote of a remote post: grace (local to A) quotes henry's post (remote to A) ---
      const graceQuote = await createAndDeliverPost(nodeA, grace.accessToken, {
        body: 'grace quotes henry',
        quotedPostId: henryPostOnA?.id ?? '',
      });
      // `CreatePostResponse.post.quotedPost` itself is unpopulated here — `PostService
      // .createPost`'s new-post branch builds its response via `toPostView(...)` directly
      // rather than `this.viewOf(...)` (the only place that fills in `quotedPost`), a
      // pre-existing gap outside this task's owned/forbidden files (reported separately,
      // not fixed here). `GetPost` goes through `viewOf` and is unaffected.
      const graceQuoteFetched = await callUnary<GetPostRequest, GetPostResponse>(
        nodeA.posts.getPost.bind(nodeA.posts),
        { id: graceQuote.post?.id ?? '' },
        { accessToken: grace.accessToken },
      );
      expect(graceQuoteFetched.post?.quotedPost?.body).toBe("henry's original post");

      const graceQuotePostOnB = await nodeB.dataSource.getRepository(Post).findOneOrFail({
        where: { canonicalUri: `${nodeA.publicOrigin}/posts/${graceQuote.post?.id ?? ''}` },
      });
      expect(graceQuotePostOnB.quotedPostId).toBe(henryPost.post?.id);
      const authOnB = await nodeB.dataSource.getRepository(QuoteAuthorization).findOneOrFail({
        where: { quotingPostId: graceQuotePostOnB.id },
      });
      expect(authOnB.quotedPostId).toBe(henryPost.post?.id);
      expect(authOnB.claimedPolicy).toBe('ANYONE');
      expect(authOnB.state).toBe('VERIFIED');
      expect(authOnB.quoterActorId).toBe(graceOnB.id);

      // --- Local-from-remote quote: henry (local to B) quotes grace's post (remote to B) ---
      const henryQuote = await createAndDeliverPost(nodeB, henry.accessToken, {
        body: 'henry quotes grace',
        quotedPostId: gracePostOnB?.id ?? '',
      });
      const henryQuoteFetched = await callUnary<GetPostRequest, GetPostResponse>(
        nodeB.posts.getPost.bind(nodeB.posts),
        { id: henryQuote.post?.id ?? '' },
        { accessToken: henry.accessToken },
      );
      expect(henryQuoteFetched.post?.quotedPost?.body).toBe("grace's original post");

      const henryQuotePostOnA = await nodeA.dataSource.getRepository(Post).findOneOrFail({
        where: { canonicalUri: `${nodeB.publicOrigin}/posts/${henryQuote.post?.id ?? ''}` },
      });
      expect(henryQuotePostOnA.quotedPostId).toBe(gracePost.post?.id);
      const authOnA = await nodeA.dataSource.getRepository(QuoteAuthorization).findOneOrFail({
        where: { quotingPostId: henryQuotePostOnA.id },
      });
      expect(authOnA.quotedPostId).toBe(gracePost.post?.id);
      expect(authOnA.claimedPolicy).toBe('ANYONE');
      expect(authOnA.state).toBe('VERIFIED');
      expect(authOnA.quoterActorId).toBe(henryOnA.id);
    }, 60_000);
  },
);
