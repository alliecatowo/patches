import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import { Notification } from '@patches/database';
import { RATE_LIMITS } from '@patches/domain';
import {
  createAuthClient,
  createCommunityClient,
  createFeedClient,
  createLabelClient,
  createPostClient,
  type ApplyLabelRequest,
  type ApplyLabelResponse,
  type AuthGrpcClient,
  type CommunityGrpcClient,
  type CreateCommunityRequest,
  type CreateCommunityResponse,
  type CreateLabelerRequest,
  type CreateLabelerResponse,
  type CreatePostRequest,
  type CreatePostResponse,
  type FeedGrpcClient,
  type GetLabelerRequest,
  type GetLabelerResponse,
  type GetPostRequest,
  type GetPostResponse,
  type LabelGrpcClient,
  type ListActorPostsRequest,
  type ListActorPostsResponse,
  type ListLabelersRequest,
  type ListLabelersResponse,
  type ListLabelsOnSubjectRequest,
  type ListLabelsOnSubjectResponse,
  type ListRepliesRequest,
  type ListRepliesResponse,
  type PostGrpcClient,
  type RetractLabelRequest,
  type RetractLabelResponse,
  type SetLabelerSubscriptionActionRequest,
  type SetLabelerSubscriptionActionResponse,
  type SubscribeLabelerRequest,
  type SubscribeLabelerResponse,
} from '@patches/proto';
import { LabelAction, PostVisibility, QuotePolicy } from '@patches/proto/nest';
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

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn('[apps/server] Skipping labels integration tests: TEST_DATABASE_URL is not set.');
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'LabelService over gRPC (integration, P14-009)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let labels: LabelGrpcClient;
    let posts: PostGrpcClient;
    let feeds: FeedGrpcClient;
    let communities: CommunityGrpcClient;
    let inviterUserId: string;
    let owner: TestActor;
    let subscriber: TestActor;
    let outsider: TestActor;
    let postAuthor: TestActor;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `labelinviter${testSuffix()}`,
      });
      inviterUserId = user.id;

      // `{ http: true }`: the node-labeler seed (`modules/labels/label-seed.service.ts`) runs
      // from Nest's `OnModuleInit` hook, which `startTestServer()` only triggers when the HTTP
      // listener is also requested — see that service's doc comment.
      server = await startTestServer({ http: true });
      const creds = grpcCredentials.createInsecure();
      auth = createAuthClient(server.url, creds);
      labels = createLabelClient(server.url, creds);
      posts = createPostClient(server.url, creds);
      feeds = createFeedClient(server.url, creds);
      communities = createCommunityClient(server.url, creds);

      owner = await registerTestActor(auth, dataSource, inviterUserId);
      subscriber = await registerTestActor(auth, dataSource, inviterUserId);
      outsider = await registerTestActor(auth, dataSource, inviterUserId);
      postAuthor = await registerTestActor(auth, dataSource, inviterUserId);
    }, 60_000);

    afterAll(async () => {
      auth.close();
      labels.close();
      posts.close();
      feeds.close();
      communities.close();
      await server.close();
      await dataSource.destroy();
    });

    it('seeds an idempotent node labeler subscribed by default', async () => {
      const listed = await callUnary<ListLabelersRequest, ListLabelersResponse>(
        labels.listLabelers.bind(labels),
        { cursor: '', limit: 50 },
      );
      const nodeLabelers = listed.labelers.filter((row) => row.isNodeLabeler);
      expect(nodeLabelers).toHaveLength(1);
      expect(nodeLabelers[0]?.vocabulary.length).toBeGreaterThan(0);
    });

    it(
      'runs the full labeler/label lifecycle: closed vocabulary, authority, subscriber-scoped ' +
        'visibility, self-inspection, rate limiting, and no notification',
      async () => {
        const suffix = testSuffix();

        // A post to label.
        const created = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          {
            clientRequestId: randomUUID(),
            body: `label me ${suffix}`,
            linkUrl: '',
            visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
            contentWarning: '',
            inReplyToId: '',
            mediaIds: [],
            quotedPostId: '',
            communityId: '',
            quotePolicy: QuotePolicy.QUOTE_POLICY_ANYONE,
          },
          { accessToken: postAuthor.accessToken },
        );
        const postId = created.post?.id ?? '';
        expect(postId).not.toBe('');

        // CreateLabeler: closed vocabulary, personal labeler.
        const labeler = await callUnary<CreateLabelerRequest, CreateLabelerResponse>(
          labels.createLabeler.bind(labels),
          {
            communityId: '',
            vocabulary: [
              {
                value: `spam-${suffix}`,
                description: 'Spam',
                defaultAction: LabelAction.LABEL_ACTION_WARN,
                mandatory: false,
              },
              {
                value: `mandatory-${suffix}`,
                description: 'Legally required',
                defaultAction: LabelAction.LABEL_ACTION_HIDE,
                mandatory: true,
              },
            ],
          },
          { accessToken: owner.accessToken },
        );
        const labelerId = labeler.labeler?.id ?? '';
        expect(labelerId).not.toBe('');
        expect(labeler.labeler?.actor?.id).toBe(owner.actorId);
        expect(labeler.labeler?.vocabulary).toHaveLength(2);

        const fetched = await callUnary<GetLabelerRequest, GetLabelerResponse>(
          labels.getLabeler.bind(labels),
          { id: labelerId },
        );
        expect(fetched.labeler?.id).toBe(labelerId);

        // Authority: only the labeler's own actor may apply/retract.
        const forbidden = await expectRejection<ApplyLabelRequest, ApplyLabelResponse>(
          labels.applyLabel.bind(labels),
          {
            labelerId,
            subjectActorId: '',
            subjectPostId: postId,
            value: `spam-${suffix}`,
            expiresAt: undefined,
          },
          { accessToken: outsider.accessToken },
        );
        expect(forbidden.code).toBe(GrpcStatus.PERMISSION_DENIED);

        // Closed vocabulary: a free-text value is rejected.
        const invalidValue = await expectRejection<ApplyLabelRequest, ApplyLabelResponse>(
          labels.applyLabel.bind(labels),
          {
            labelerId,
            subjectActorId: '',
            subjectPostId: postId,
            value: 'not-in-vocabulary',
            expiresAt: undefined,
          },
          { accessToken: owner.accessToken },
        );
        expect(invalidValue.code).toBe(GrpcStatus.INVALID_ARGUMENT);

        // No notification is ever created for the labeled actor (spec §200.4, §208).
        const notificationsBefore = await dataSource
          .getRepository(Notification)
          .countBy({ recipientActorId: postAuthor.actorId });

        const applied = await callUnary<ApplyLabelRequest, ApplyLabelResponse>(
          labels.applyLabel.bind(labels),
          {
            labelerId,
            subjectActorId: '',
            subjectPostId: postId,
            value: `spam-${suffix}`,
            expiresAt: undefined,
          },
          { accessToken: owner.accessToken },
        );
        expect(applied.label?.value).toBe(`spam-${suffix}`);
        expect(applied.label?.subjectPostId).toBe(postId);
        const labelId = applied.label?.id ?? '';

        const notificationsAfter = await dataSource
          .getRepository(Notification)
          .countBy({ recipientActorId: postAuthor.actorId });
        expect(notificationsAfter).toBe(notificationsBefore);

        // Idempotent: re-applying the same (labeler, subject, value) returns the same row.
        const reapplied = await callUnary<ApplyLabelRequest, ApplyLabelResponse>(
          labels.applyLabel.bind(labels),
          {
            labelerId,
            subjectActorId: '',
            subjectPostId: postId,
            value: `spam-${suffix}`,
            expiresAt: undefined,
          },
          { accessToken: owner.accessToken },
        );
        expect(reapplied.label?.id).toBe(labelId);

        // Subscriber-scoped visibility (spec §200.3): a viewer sees `Post.labels` only for a
        // labeler they subscribe to.
        const beforeSubscribe = await callUnary<ListActorPostsRequest, ListActorPostsResponse>(
          feeds.listActorPosts.bind(feeds),
          { actorId: postAuthor.actorId, cursor: '', limit: 20 },
          { accessToken: subscriber.accessToken },
        );
        const beforeSubscribePost = beforeSubscribe.posts.find((post) => post.id === postId);
        expect(beforeSubscribePost?.labels).toEqual([]);

        await callUnary<SubscribeLabelerRequest, SubscribeLabelerResponse>(
          labels.subscribeLabeler.bind(labels),
          { labelerId },
          { accessToken: subscriber.accessToken },
        );

        const afterSubscribe = await callUnary<ListActorPostsRequest, ListActorPostsResponse>(
          feeds.listActorPosts.bind(feeds),
          { actorId: postAuthor.actorId, cursor: '', limit: 20 },
          { accessToken: subscriber.accessToken },
        );
        const afterSubscribePost = afterSubscribe.posts.find((post) => post.id === postId);
        expect(afterSubscribePost?.labels.map((label) => label.value)).toContain(`spam-${suffix}`);

        // A non-subscriber, and an anonymous viewer, never see the label.
        const outsiderView = await callUnary<ListActorPostsRequest, ListActorPostsResponse>(
          feeds.listActorPosts.bind(feeds),
          { actorId: postAuthor.actorId, cursor: '', limit: 20 },
          { accessToken: outsider.accessToken },
        );
        expect(outsiderView.posts.find((post) => post.id === postId)?.labels ?? []).toEqual([]);

        const anonymousView = await callUnary<ListActorPostsRequest, ListActorPostsResponse>(
          feeds.listActorPosts.bind(feeds),
          { actorId: postAuthor.actorId, cursor: '', limit: 20 },
        );
        expect(anonymousView.posts.find((post) => post.id === postId)?.labels ?? []).toEqual([]);

        // Self-inspection (spec §200.4): the labeled actor sees the label via
        // `ListLabelsOnSubject` even without subscribing to the labeler.
        const selfInspection = await callUnary<
          ListLabelsOnSubjectRequest,
          ListLabelsOnSubjectResponse
        >(
          labels.listLabelsOnSubject.bind(labels),
          { subjectActorId: '', subjectPostId: postId, cursor: '', limit: 20 },
          { accessToken: postAuthor.accessToken },
        );
        expect(selfInspection.labels.map((label) => label.value)).toContain(`spam-${suffix}`);

        // A non-subscriber, non-subject caller sees nothing via the same RPC.
        const outsiderInspection = await callUnary<
          ListLabelsOnSubjectRequest,
          ListLabelsOnSubjectResponse
        >(
          labels.listLabelsOnSubject.bind(labels),
          { subjectActorId: '', subjectPostId: postId, cursor: '', limit: 20 },
          { accessToken: outsider.accessToken },
        );
        expect(outsiderInspection.labels).toEqual([]);

        // Mandatory values cannot be set to ignore (spec §200.3).
        const mandatoryIgnore = await expectRejection<
          SetLabelerSubscriptionActionRequest,
          SetLabelerSubscriptionActionResponse
        >(
          labels.setLabelerSubscriptionAction.bind(labels),
          { labelerId, value: `mandatory-${suffix}`, action: LabelAction.LABEL_ACTION_IGNORE },
          { accessToken: subscriber.accessToken },
        );
        expect(mandatoryIgnore.code).toBe(GrpcStatus.INVALID_ARGUMENT);

        // A non-mandatory value may be set to ignore.
        await callUnary<SetLabelerSubscriptionActionRequest, SetLabelerSubscriptionActionResponse>(
          labels.setLabelerSubscriptionAction.bind(labels),
          { labelerId, value: `spam-${suffix}`, action: LabelAction.LABEL_ACTION_IGNORE },
          { accessToken: subscriber.accessToken },
        );

        // Rate limiting (spec §200.5, §204: 300/day per labeler) — seed the bucket at the
        // limit directly rather than looping hundreds of real RPCs.
        const windowMs = 24 * 60 * 60_000;
        const now = Date.now();
        const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
        const windowEnd = new Date(windowStart.getTime() + windowMs);
        await dataSource.query(
          `INSERT INTO rate_limit_buckets (key, window_start, cost, window_end)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (key, window_start) DO UPDATE SET cost = $3`,
          [
            `label_apply:labeler:${labelerId}`,
            windowStart,
            RATE_LIMITS.labelApplyPerDayPerLabeler,
            windowEnd,
          ],
        );
        const rateLimited = await expectRejection<ApplyLabelRequest, ApplyLabelResponse>(
          labels.applyLabel.bind(labels),
          {
            labelerId,
            subjectActorId: '',
            subjectPostId: postId,
            value: `mandatory-${suffix}`,
            expiresAt: undefined,
          },
          { accessToken: owner.accessToken },
        );
        expect(rateLimited.code).toBe(GrpcStatus.RESOURCE_EXHAUSTED);

        // Retraction preserves history (sets `retracted_at`, doesn't delete) and is idempotent.
        const retracted = await callUnary<RetractLabelRequest, RetractLabelResponse>(
          labels.retractLabel.bind(labels),
          { labelId },
          { accessToken: owner.accessToken },
        );
        expect(retracted.label?.retractedAt).toBeDefined();

        const retractedAgain = await callUnary<RetractLabelRequest, RetractLabelResponse>(
          labels.retractLabel.bind(labels),
          { labelId },
          { accessToken: owner.accessToken },
        );
        expect(retractedAgain.label?.retractedAt).toEqual(retracted.label?.retractedAt);

        const afterRetraction = await callUnary<ListActorPostsRequest, ListActorPostsResponse>(
          feeds.listActorPosts.bind(feeds),
          { actorId: postAuthor.actorId, cursor: '', limit: 20 },
          { accessToken: subscriber.accessToken },
        );
        expect(afterRetraction.posts.find((post) => post.id === postId)?.labels ?? []).toEqual([]);
      },
      30_000,
    );

    it('populates Post.labels on GetPost and ListReplies, not just feeds (P14 follow-up)', async () => {
      const suffix = testSuffix();

      const root = await callUnary<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        {
          clientRequestId: randomUUID(),
          body: `single-post-label-check ${suffix}`,
          linkUrl: '',
          visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
          contentWarning: '',
          inReplyToId: '',
          mediaIds: [],
          quotedPostId: '',
          communityId: '',
          quotePolicy: QuotePolicy.QUOTE_POLICY_ANYONE,
        },
        { accessToken: postAuthor.accessToken },
      );
      const postId = root.post?.id ?? '';
      expect(postId).not.toBe('');

      const reply = await callUnary<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        {
          clientRequestId: randomUUID(),
          body: `reply-label-check ${suffix}`,
          linkUrl: '',
          visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
          contentWarning: '',
          inReplyToId: postId,
          mediaIds: [],
          quotedPostId: '',
          communityId: '',
          quotePolicy: QuotePolicy.QUOTE_POLICY_ANYONE,
        },
        { accessToken: postAuthor.accessToken },
      );
      const replyId = reply.post?.id ?? '';
      expect(replyId).not.toBe('');

      const labeler = await callUnary<CreateLabelerRequest, CreateLabelerResponse>(
        labels.createLabeler.bind(labels),
        {
          communityId: '',
          vocabulary: [
            {
              value: `single-post-${suffix}`,
              description: 'Single-post check',
              defaultAction: LabelAction.LABEL_ACTION_WARN,
              mandatory: false,
            },
          ],
        },
        { accessToken: owner.accessToken },
      );
      const labelerId = labeler.labeler?.id ?? '';

      await callUnary<ApplyLabelRequest, ApplyLabelResponse>(
        labels.applyLabel.bind(labels),
        {
          labelerId,
          subjectActorId: '',
          subjectPostId: postId,
          value: `single-post-${suffix}`,
          expiresAt: undefined,
        },
        { accessToken: owner.accessToken },
      );
      await callUnary<ApplyLabelRequest, ApplyLabelResponse>(
        labels.applyLabel.bind(labels),
        {
          labelerId,
          subjectActorId: '',
          subjectPostId: replyId,
          value: `single-post-${suffix}`,
          expiresAt: undefined,
        },
        { accessToken: owner.accessToken },
      );

      // Before subscribing, GetPost/ListReplies show no labels (subscriber-scoped, spec §200.3).
      const beforeGet = await callUnary<GetPostRequest, GetPostResponse>(
        posts.getPost.bind(posts),
        { id: postId },
        { accessToken: subscriber.accessToken },
      );
      expect(beforeGet.post?.labels ?? []).toEqual([]);

      await callUnary<SubscribeLabelerRequest, SubscribeLabelerResponse>(
        labels.subscribeLabeler.bind(labels),
        { labelerId },
        { accessToken: subscriber.accessToken },
      );

      const afterGet = await callUnary<GetPostRequest, GetPostResponse>(
        posts.getPost.bind(posts),
        { id: postId },
        { accessToken: subscriber.accessToken },
      );
      expect(afterGet.post?.labels.map((label) => label.value)).toContain(`single-post-${suffix}`);

      const repliesPage = await callUnary<ListRepliesRequest, ListRepliesResponse>(
        posts.listReplies.bind(posts),
        { postId, cursor: '', limit: 20, maxDepth: 4 },
        { accessToken: subscriber.accessToken },
      );
      const replyView = repliesPage.posts.find((post) => post.id === replyId);
      expect(replyView?.labels.map((label) => label.value)).toContain(`single-post-${suffix}`);

      // An outsider (not subscribed) never sees the label on either path.
      const outsiderGet = await callUnary<GetPostRequest, GetPostResponse>(
        posts.getPost.bind(posts),
        { id: postId },
        { accessToken: outsider.accessToken },
      );
      expect(outsiderGet.post?.labels ?? []).toEqual([]);
    });

    it('lets a community moderator operate a community-owned labeler, and forbids a non-moderator', async () => {
      const suffix = testSuffix()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 8);
      const community = await callUnary<CreateCommunityRequest, CreateCommunityResponse>(
        communities.createCommunity.bind(communities),
        {
          clientRequestId: randomUUID(),
          name: `lbl_${suffix}`,
          displayName: 'Label Community',
          description: 'Community-owned labeler test',
          rules: 'Be kind.',
          isPublic: true,
        },
        { accessToken: owner.accessToken },
      );
      const communityId = community.community?.id ?? '';
      expect(communityId).not.toBe('');

      const forbidden = await expectRejection<CreateLabelerRequest, CreateLabelerResponse>(
        labels.createLabeler.bind(labels),
        {
          communityId,
          vocabulary: [
            {
              value: `off-topic-${suffix}`,
              description: '',
              defaultAction: LabelAction.LABEL_ACTION_COLLAPSE,
              mandatory: false,
            },
          ],
        },
        { accessToken: outsider.accessToken },
      );
      expect(forbidden.code).toBe(GrpcStatus.PERMISSION_DENIED);

      const communityLabeler = await callUnary<CreateLabelerRequest, CreateLabelerResponse>(
        labels.createLabeler.bind(labels),
        {
          communityId,
          vocabulary: [
            {
              value: `off-topic-${suffix}`,
              description: '',
              defaultAction: LabelAction.LABEL_ACTION_COLLAPSE,
              mandatory: false,
            },
          ],
        },
        { accessToken: owner.accessToken },
      );
      expect(communityLabeler.labeler?.community?.id).toBe(communityId);
      // proto-loader decodes an absent nested-message field as `null`, not `undefined`
      // (docs/agents/LEARNINGS.md's "proto-loader null message fields").
      expect(communityLabeler.labeler?.actor).toBeNull();
    });
  },
);
