import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAuthClient,
  createFeedClient,
  createPostClient,
  createSocialGraphClient,
  FOLLOW_STATE,
  type AcceptFollowRequestRequest,
  type AcceptFollowRequestResponse,
  type AuthGrpcClient,
  type CreatePostRequest,
  type CreatePostResponse,
  type FeedGrpcClient,
  type FollowActorRequest,
  type FollowActorResponse,
  type GetRelationshipRequest,
  type GetRelationshipResponse,
  type ListActorPostsRequest,
  type ListActorPostsResponse,
  type ListFollowRequestsRequest,
  type ListFollowRequestsResponse,
  type PostGrpcClient,
  type RejectFollowRequestRequest,
  type RejectFollowRequestResponse,
  type SocialGraphGrpcClient,
  type UnfollowActorRequest,
  type UnfollowActorResponse,
} from '@patches/proto';
import { PostVisibility, QuotePolicy } from '@patches/proto/nest';
import { ActorPrivacyPrefs, Notification } from '@patches/database';
import { createTestBlock, createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { registerTestActor, type TestActor } from './support/fixtures.js';
import {
  callUnary,
  expectRejection,
  startTestServer,
  type TestServer,
} from './support/test-server.js';

/**
 * Locked accounts + follow requests (Amendment C §197.5, P14-010's follow-up) end-to-end over
 * real gRPC against real PostgreSQL (spec §118–§119): `FollowActor` against a locked actor
 * becomes a pending request rather than an immediate follow; `ListFollowRequests`/
 * `AcceptFollowRequest`/`RejectFollowRequest`; `UnfollowActor` cancelling a pending request;
 * block-awareness; rate limiting; unlocking not auto-accepting; and the correctness fix this
 * whole feature exists for — a `FOLLOWERS`-visibility post staying invisible to a requester
 * until their request is actually accepted.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping graph follow-request integration tests: TEST_DATABASE_URL is not ' +
      'set (start Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'locked accounts + follow requests over gRPC (integration, §197.5)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let graph: SocialGraphGrpcClient;
    let posts: PostGrpcClient;
    let feeds: FeedGrpcClient;
    let inviterUserId: string;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `flrqinviter${randomUUID().replace(/-/g, '').slice(0, 6)}`,
      });
      inviterUserId = user.id;

      server = await startTestServer();
      auth = createAuthClient(server.url, grpcCredentials.createInsecure());
      graph = createSocialGraphClient(server.url, grpcCredentials.createInsecure());
      posts = createPostClient(server.url, grpcCredentials.createInsecure());
      feeds = createFeedClient(server.url, grpcCredentials.createInsecure());
    }, 60_000);

    afterAll(async () => {
      auth.close();
      graph.close();
      posts.close();
      feeds.close();
      await server.close();
      await dataSource.destroy();
    });

    async function newActor(displayName: string): Promise<TestActor> {
      return registerTestActor(auth, dataSource, inviterUserId, { displayName });
    }

    /** Directly flips `actor_privacy_prefs.locked` — same row `PrivacyService.UpdatePrivacyPrefs`
     * writes, but this suite only cares about the flag's effect on `GraphService`, not the
     * `PrivacyService` RPC surface (owned by a different task's file set). */
    async function setLocked(actorId: string, locked: boolean): Promise<void> {
      const repo = dataSource.getRepository(ActorPrivacyPrefs);
      const existing = await repo.findOne({ where: { actorId } });
      if (existing === null) {
        await repo.save(
          repo.create({
            actorId,
            discoverable: true,
            indexable: true,
            showInLocalFeed: true,
            locked,
            privacyNoticeVersion: null,
            privacyNoticeAcknowledgedAt: null,
          }),
        );
        return;
      }
      existing.locked = locked;
      await repo.save(existing);
    }

    it('a follow to a locked actor becomes a pending request, not an immediate follow', async () => {
      const owner = await newActor('LockedOwner');
      const requester = await newActor('Requester');
      await setLocked(owner.actorId, true);

      const response = await callUnary<FollowActorRequest, FollowActorResponse>(
        graph.followActor.bind(graph),
        { actorId: owner.actorId },
        { accessToken: requester.accessToken },
      );
      expect(response.requested).toBe(true);
      expect(response.relationship?.state).toBe(FOLLOW_STATE.PENDING);
      expect(response.relationship?.requested).toBe(true);

      // Idempotent: calling again while already pending returns the same outstanding state,
      // not a second row/notification.
      const again = await callUnary<FollowActorRequest, FollowActorResponse>(
        graph.followActor.bind(graph),
        { actorId: owner.actorId },
        { accessToken: requester.accessToken },
      );
      expect(again.requested).toBe(true);

      const ownerView = await callUnary<GetRelationshipRequest, GetRelationshipResponse>(
        graph.getRelationship.bind(graph),
        { actorId: requester.actorId },
        { accessToken: owner.accessToken },
      );
      expect(ownerView.relationship?.requestedBy).toBe(true);
      expect(ownerView.relationship?.followedBy).toBe(false);

      const requests = await callUnary<ListFollowRequestsRequest, ListFollowRequestsResponse>(
        graph.listFollowRequests.bind(graph),
        { cursor: '', limit: 50 },
        { accessToken: owner.accessToken },
      );
      expect(requests.requests.some((request) => request.actor?.id === requester.actorId)).toBe(
        true,
      );

      const notificationRows = await dataSource.getRepository(Notification).find({
        where: {
          recipientActorId: owner.actorId,
          actorId: requester.actorId,
          type: 'FOLLOW_REQUEST',
        },
      });
      expect(notificationRows).toHaveLength(1);
    });

    it('accepting creates the follow and notifies the requester', async () => {
      const owner = await newActor('AcceptOwner');
      const requester = await newActor('AcceptRequester');
      await setLocked(owner.actorId, true);

      await callUnary<FollowActorRequest, FollowActorResponse>(
        graph.followActor.bind(graph),
        { actorId: owner.actorId },
        { accessToken: requester.accessToken },
      );

      const accepted = await callUnary<AcceptFollowRequestRequest, AcceptFollowRequestResponse>(
        graph.acceptFollowRequest.bind(graph),
        { actorId: requester.actorId },
        { accessToken: owner.accessToken },
      );
      expect(accepted.relationship?.followedBy).toBe(true);
      expect(accepted.relationship?.requestedBy).toBe(false);

      const requesterView = await callUnary<GetRelationshipRequest, GetRelationshipResponse>(
        graph.getRelationship.bind(graph),
        { actorId: owner.actorId },
        { accessToken: requester.accessToken },
      );
      expect(requesterView.relationship?.state).toBe(FOLLOW_STATE.FOLLOWING);
      expect(requesterView.relationship?.requested).toBe(false);

      // The request queue no longer lists it.
      const requests = await callUnary<ListFollowRequestsRequest, ListFollowRequestsResponse>(
        graph.listFollowRequests.bind(graph),
        { cursor: '', limit: 50 },
        { accessToken: owner.accessToken },
      );
      expect(requests.requests.some((request) => request.actor?.id === requester.actorId)).toBe(
        false,
      );

      const notificationRows = await dataSource.getRepository(Notification).find({
        where: { recipientActorId: requester.actorId, actorId: owner.actorId, type: 'FOLLOW' },
      });
      expect(notificationRows).toHaveLength(1);

      // A second accept has nothing left to accept.
      const error = await expectRejection<AcceptFollowRequestRequest, AcceptFollowRequestResponse>(
        graph.acceptFollowRequest.bind(graph),
        { actorId: requester.actorId },
        { accessToken: owner.accessToken },
      );
      expect(error.code).toBe(GrpcStatus.NOT_FOUND);
    });

    it('rejecting discards the request without ever creating a follow', async () => {
      const owner = await newActor('RejectOwner');
      const requester = await newActor('RejectRequester');
      await setLocked(owner.actorId, true);

      await callUnary<FollowActorRequest, FollowActorResponse>(
        graph.followActor.bind(graph),
        { actorId: owner.actorId },
        { accessToken: requester.accessToken },
      );

      const rejected = await callUnary<RejectFollowRequestRequest, RejectFollowRequestResponse>(
        graph.rejectFollowRequest.bind(graph),
        { actorId: requester.actorId },
        { accessToken: owner.accessToken },
      );
      expect(rejected).toEqual({});

      const requesterView = await callUnary<GetRelationshipRequest, GetRelationshipResponse>(
        graph.getRelationship.bind(graph),
        { actorId: owner.actorId },
        { accessToken: requester.accessToken },
      );
      expect(requesterView.relationship?.state).toBe(FOLLOW_STATE.NONE);
      expect(requesterView.relationship?.requested).toBe(false);

      const error = await expectRejection<RejectFollowRequestRequest, RejectFollowRequestResponse>(
        graph.rejectFollowRequest.bind(graph),
        { actorId: requester.actorId },
        { accessToken: owner.accessToken },
      );
      expect(error.code).toBe(GrpcStatus.NOT_FOUND);
    });

    it('UnfollowActor cancels a pending outgoing request', async () => {
      const owner = await newActor('CancelOwner');
      const requester = await newActor('CancelRequester');
      await setLocked(owner.actorId, true);

      await callUnary<FollowActorRequest, FollowActorResponse>(
        graph.followActor.bind(graph),
        { actorId: owner.actorId },
        { accessToken: requester.accessToken },
      );

      const cancelled = await callUnary<UnfollowActorRequest, UnfollowActorResponse>(
        graph.unfollowActor.bind(graph),
        { actorId: owner.actorId },
        { accessToken: requester.accessToken },
      );
      expect(cancelled.relationship?.state).toBe(FOLLOW_STATE.NONE);
      expect(cancelled.relationship?.requested).toBe(false);

      const requests = await callUnary<ListFollowRequestsRequest, ListFollowRequestsResponse>(
        graph.listFollowRequests.bind(graph),
        { cursor: '', limit: 50 },
        { accessToken: owner.accessToken },
      );
      expect(requests.requests.some((request) => request.actor?.id === requester.actorId)).toBe(
        false,
      );
    });

    it('rejects a follow request toward a locked actor blocked in either direction', async () => {
      const owner = await newActor('BlockedOwner');
      const requester = await newActor('BlockedRequester');
      await setLocked(owner.actorId, true);
      await createTestBlock(dataSource.manager, {
        blockerActorId: owner.actorId,
        blockedActorId: requester.actorId,
      });

      const error = await expectRejection<FollowActorRequest, FollowActorResponse>(
        graph.followActor.bind(graph),
        { actorId: owner.actorId },
        { accessToken: requester.accessToken },
      );
      expect(error.code).toBe(GrpcStatus.PERMISSION_DENIED);

      const requests = await callUnary<ListFollowRequestsRequest, ListFollowRequestsResponse>(
        graph.listFollowRequests.bind(graph),
        { cursor: '', limit: 50 },
        { accessToken: owner.accessToken },
      );
      expect(requests.requests).toHaveLength(0);
    });

    it('unlocking an account does not auto-accept a pending request', async () => {
      const owner = await newActor('UnlockOwner');
      const requester = await newActor('UnlockRequester');
      await setLocked(owner.actorId, true);

      await callUnary<FollowActorRequest, FollowActorResponse>(
        graph.followActor.bind(graph),
        { actorId: owner.actorId },
        { accessToken: requester.accessToken },
      );

      await setLocked(owner.actorId, false);

      const requesterView = await callUnary<GetRelationshipRequest, GetRelationshipResponse>(
        graph.getRelationship.bind(graph),
        { actorId: owner.actorId },
        { accessToken: requester.accessToken },
      );
      expect(requesterView.relationship?.state).toBe(FOLLOW_STATE.PENDING);
      expect(requesterView.relationship?.requested).toBe(true);

      const requests = await callUnary<ListFollowRequestsRequest, ListFollowRequestsResponse>(
        graph.listFollowRequests.bind(graph),
        { cursor: '', limit: 50 },
        { accessToken: owner.accessToken },
      );
      expect(requests.requests.some((request) => request.actor?.id === requester.actorId)).toBe(
        true,
      );
    });

    it('a FOLLOWERS-visibility post stays invisible to the requester until accepted', async () => {
      const owner = await newActor('VisibilityOwner');
      const requester = await newActor('VisibilityRequester');
      await setLocked(owner.actorId, true);

      await callUnary<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        {
          clientRequestId: randomUUID(),
          body: 'followers only, locked account',
          linkUrl: '',
          visibility: PostVisibility.POST_VISIBILITY_FOLLOWERS,
          contentWarning: '',
          inReplyToId: '',
          mediaIds: [],
          quotedPostId: '',
          communityId: '',
          quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
        },
        { accessToken: owner.accessToken },
      );

      await callUnary<FollowActorRequest, FollowActorResponse>(
        graph.followActor.bind(graph),
        { actorId: owner.actorId },
        { accessToken: requester.accessToken },
      );

      const beforeAccept = await callUnary<ListActorPostsRequest, ListActorPostsResponse>(
        feeds.listActorPosts.bind(feeds),
        { actorId: owner.actorId, cursor: '', limit: 10 },
        { accessToken: requester.accessToken },
      );
      expect(beforeAccept.posts).toHaveLength(0);

      await callUnary<AcceptFollowRequestRequest, AcceptFollowRequestResponse>(
        graph.acceptFollowRequest.bind(graph),
        { actorId: requester.actorId },
        { accessToken: owner.accessToken },
      );

      const afterAccept = await callUnary<ListActorPostsRequest, ListActorPostsResponse>(
        feeds.listActorPosts.bind(feeds),
        { actorId: owner.actorId, cursor: '', limit: 10 },
        { accessToken: requester.accessToken },
      );
      expect(afterAccept.posts.map((post) => post.body)).toEqual([
        'followers only, locked account',
      ]);
    });

    it('rate-limits follow requests against locked actors (spec §197.5)', async () => {
      const requester = await newActor('RateLimitedRequester');
      const owners: TestActor[] = [];
      for (let index = 0; index < 21; index += 1) {
        const owner = await newActor(`RateLimitOwner${String(index)}`);
        await setLocked(owner.actorId, true);
        owners.push(owner);
      }

      for (let index = 0; index < 20; index += 1) {
        const response = await callUnary<FollowActorRequest, FollowActorResponse>(
          graph.followActor.bind(graph),
          { actorId: owners[index]?.actorId ?? '' },
          { accessToken: requester.accessToken },
        );
        expect(response.requested).toBe(true);
      }

      const error = await expectRejection<FollowActorRequest, FollowActorResponse>(
        graph.followActor.bind(graph),
        { actorId: owners[20]?.actorId ?? '' },
        { accessToken: requester.accessToken },
      );
      expect(error.code).toBe(GrpcStatus.RESOURCE_EXHAUSTED);
    }, 30_000);
  },
);
