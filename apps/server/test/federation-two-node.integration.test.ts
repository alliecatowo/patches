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
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
} from '@patches/proto';
import { PostVisibility } from '@patches/proto/nest';
import { Post } from '@patches/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { discoverRemoteActor } from './support/federation-discovery.js';
import { drainFederationDeliveries } from './support/federation-relay.js';
import { startFederationNode, type FederationTestNode } from './support/federation-node.js';
import { mintInvite, registerTestActor } from './support/fixtures.js';
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
  },
);
