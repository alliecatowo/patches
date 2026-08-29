import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials } from '@grpc/grpc-js';
import {
  createAuthClient,
  createFeedClient,
  createNotificationClient,
  createPostClient,
  type AuthGrpcClient,
  type CreatePostRequest,
  type CreatePostResponse,
  type FeedGrpcClient,
  type GetUnreadCountRequest,
  type GetUnreadCountResponse,
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListNotificationsRequest,
  type ListNotificationsResponse,
  type LoginRequest,
  type LoginResponse,
  type NotificationGrpcClient,
  type PostGrpcClient,
} from '@patches/proto';
import { PostVisibility, QuotePolicy } from '@patches/proto/nest';
import {
  claimOutboxJobs,
  createDataSource,
  markOutboxJobSucceeded,
  OutboxJob,
} from '@patches/database';
import { createTestFollow, createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { registerTestActor, testSuffix, type TestActor } from './support/fixtures.js';
import { latencyReport, printLatencyReport, type LatencyReport } from './support/latency.js';
import { callUnary, startTestServer, type TestServer } from './support/test-server.js';

/**
 * #199 — repeatable load/capacity suite: consolidates the auth / home-feed-read / post-create
 * / notifications / federation-delivery scenarios into one runnable file, each recording
 * p50/p95 (`docs/operations/performance.md` "Load suite" has the measured transcript). This
 * is the local-machine, single-process, real-gRPC-and-real-Postgres slice of the suite —
 * client concurrency is deliberately modest (`CONCURRENCY`) since this runs on the same box
 * as every other agent's worktree (`docs/agents/HARNESS.md`); the full multi-instance/remote
 * profile matrix `docs/research/contract-load-tooling.md` describes (versioned world files,
 * a `packages/load` Connect-edge runner, CI matrix) is future work, not implemented here.
 *
 * federation-delivery measures the outbox claim → mark-succeeded queue mechanics for real
 * `FEDERATION_DELIVER`-shaped payloads via the same repository functions `apps/worker` uses
 * — not a full two-node HTTP-Signature round trip (that is `federation-two-node.integration.
 * test.ts`, which requires two built OS processes and is deliberately excluded from a suite
 * meant to run in well under a minute).
 */

const CONCURRENCY = 5;
const ITERATIONS_PER_WORKER = 10;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping load-suite perf test: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

/** Runs `run` `CONCURRENCY * iterationsPerWorker` times across `CONCURRENCY` workers. */
async function measureConcurrent(
  label: string,
  run: (workerIndex: number) => Promise<void>,
  iterationsPerWorker: number = ITERATIONS_PER_WORKER,
): Promise<LatencyReport> {
  const samples: number[] = [];
  const worker = async (workerIndex: number): Promise<void> => {
    for (let i = 0; i < iterationsPerWorker; i++) {
      const start = performance.now();
      await run(workerIndex);
      samples.push(performance.now() - start);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, workerIndex) => worker(workerIndex)));
  const report = latencyReport(samples);
  printLatencyReport(label, report);
  return report;
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'repeatable load/capacity suite (perf, #199)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let posts: PostGrpcClient;
    let feeds: FeedGrpcClient;
    let notifications: NotificationGrpcClient;
    let inviterUserId: string;
    let reader: TestActor;
    let poster: TestActor;
    let notifiee: TestActor;
    const loginPassword = 'a-perfectly-fine-load-password';
    let loginHandles: string[] = [];
    // `RateLimitService`'s real `login` budget is 10 attempts / 5 minutes per identifier
    // (`apps/server/src/modules/auth/rate-limit.service.ts`) — the auth scenario stays under
    // it per account by using one dedicated account per worker rather than one shared login,
    // matching H-027's "independent actor sessions" rule and avoiding a false RESOURCE_EXHAUSTED
    // that would otherwise dominate this scenario's own p95.
    const AUTH_ITERATIONS_PER_WORKER = 8;

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
      notifications = createNotificationClient(server.url, grpcCredentials.createInsecure());

      reader = await registerTestActor(auth, dataSource, inviterUserId);
      poster = await registerTestActor(auth, dataSource, inviterUserId);
      notifiee = await registerTestActor(auth, dataSource, inviterUserId);
      loginHandles = [];
      for (let i = 0; i < CONCURRENCY; i++) {
        const handle = `loadauth${String(i)}${testSuffix()}`;
        await registerTestActor(auth, dataSource, inviterUserId, {
          handle,
          password: loginPassword,
        });
        loginHandles.push(handle);
      }

      // reader needs something to read.
      const { actor: followee } = await createTestUser(dataSource.manager, {
        handle: `loadfollowee${testSuffix()}`,
      });
      await createTestFollow(dataSource.manager, {
        followerActorId: reader.actorId,
        followeeActorId: followee.id,
      });
    }, 60_000);

    afterAll(async () => {
      auth.close();
      posts.close();
      feeds.close();
      notifications.close();
      await server.close();
      await dataSource.destroy();
    });

    it('auth: Login p50/p95', async () => {
      const report = await measureConcurrent(
        'auth (Login)',
        async (workerIndex) => {
          const handle = loginHandles[workerIndex];
          if (handle === undefined) throw new Error('missing login handle for worker');
          await callUnary<LoginRequest, LoginResponse>(auth.login.bind(auth), {
            emailOrHandle: handle,
            password: loginPassword,
          });
        },
        AUTH_ITERATIONS_PER_WORKER,
      );
      expect(report.samples).toBe(CONCURRENCY * AUTH_ITERATIONS_PER_WORKER);
    });

    it('home-feed-read: ListHomeFeed p50/p95', async () => {
      const report = await measureConcurrent('home-feed-read (ListHomeFeed)', async () => {
        await callUnary<ListHomeFeedRequest, ListHomeFeedResponse>(
          feeds.listHomeFeed.bind(feeds),
          { cursor: '', limit: 20 },
          { accessToken: reader.accessToken },
        );
      });
      expect(report.samples).toBe(CONCURRENCY * ITERATIONS_PER_WORKER);
    });

    it('post-create: CreatePost p50/p95', async () => {
      const report = await measureConcurrent('post-create (CreatePost)', async () => {
        const response = await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          {
            clientRequestId: randomUUID(),
            body: `load suite post ${testSuffix()}`,
            linkUrl: '',
            visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
            contentWarning: '',
            inReplyToId: '',
            mediaIds: [],
            quotedPostId: '',
            communityId: '',
            quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
          },
          { accessToken: poster.accessToken },
        );
        if (response.post === undefined) throw new Error('CreatePost returned no post');
      });
      expect(report.samples).toBe(CONCURRENCY * ITERATIONS_PER_WORKER);
    });

    it('notifications: ListNotifications + GetUnreadCount p50/p95', async () => {
      // Seed a handful of REPLY notifications for notifiee before polling — a poll against
      // an always-empty inbox would understate real read cost.
      const rootResponse = await callUnary<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        {
          clientRequestId: randomUUID(),
          body: `load suite notify-me root ${testSuffix()}`,
          linkUrl: '',
          visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
          contentWarning: '',
          inReplyToId: '',
          mediaIds: [],
          quotedPostId: '',
          communityId: '',
          quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
        },
        { accessToken: notifiee.accessToken },
      );
      const rootId = rootResponse.post?.id;
      if (rootId === undefined) throw new Error('CreatePost returned no post');
      for (let i = 0; i < 5; i++) {
        await callUnary<CreatePostRequest, CreatePostResponse>(
          posts.createPost.bind(posts),
          {
            clientRequestId: randomUUID(),
            body: `load suite reply ${String(i)} ${testSuffix()}`,
            linkUrl: '',
            visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
            contentWarning: '',
            inReplyToId: rootId,
            mediaIds: [],
            quotedPostId: '',
            communityId: '',
            quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
          },
          { accessToken: poster.accessToken },
        );
      }

      const report = await measureConcurrent(
        'notifications (ListNotifications + GetUnreadCount)',
        async () => {
          await callUnary<ListNotificationsRequest, ListNotificationsResponse>(
            notifications.listNotifications.bind(notifications),
            { cursor: '', limit: 20 },
            { accessToken: notifiee.accessToken },
          );
          await callUnary<GetUnreadCountRequest, GetUnreadCountResponse>(
            notifications.getUnreadCount.bind(notifications),
            {},
            { accessToken: notifiee.accessToken },
          );
        },
      );
      expect(report.samples).toBe(CONCURRENCY * ITERATIONS_PER_WORKER);
    });

    it('federation-delivery: outbox claim -> succeeded queue latency p50/p95', async () => {
      if (testDatabaseUrl === undefined)
        throw new Error('unreachable — describe.skipIf guards this');
      const workerId = `load-suite-${testSuffix()}`;
      const nJobs = CONCURRENCY * ITERATIONS_PER_WORKER;

      await dataSource.manager.transaction(async (manager) => {
        const repo = manager.getRepository(OutboxJob);
        const jobs = Array.from({ length: nJobs }, (_, i) =>
          repo.create({
            type: 'FEDERATION_DELIVER',
            payload: {
              activityId: `https://load-suite.test/activities/${String(i)}`,
              inboxUrl: 'https://load-suite.test/inbox',
              actorId: poster.actorId,
              activity: {
                type: 'Create',
                object: { id: `https://load-suite.test/notes/${String(i)}` },
              },
            },
            status: 'PENDING' as const,
            attempts: 0,
            maxAttempts: 3,
          }),
        );
        await repo.save(jobs);
      });

      // A second real DataSource, same as `apps/worker`'s pool, since `claimOutboxJobs`
      // requires a transactional manager and this must not compete with the perf suite's
      // own migrations connection for locks.
      const workerDataSource = createDataSource({
        url: testDatabaseUrl,
        ssl: false,
        logging: false,
      });
      await workerDataSource.initialize();
      try {
        // Earlier scenarios in this file (register/CreatePost) enqueue their own real outbox
        // jobs (e.g. `SEND_VERIFICATION_EMAIL`) that are still `PENDING`. `claimOutboxJobs`
        // claims across all types by id order, so this scenario would silently also measure
        // those unrelated jobs' claim latency without an explicit exclude list.
        const otherPendingTypes = (
          await workerDataSource.query<{ type: string }[]>(
            "SELECT DISTINCT type FROM outbox_jobs WHERE status = 'PENDING' AND type != 'FEDERATION_DELIVER'",
          )
        ).map((row) => row.type);

        const samples: number[] = [];
        for (;;) {
          const start = performance.now();
          const claimed = await workerDataSource.transaction(async (manager) => {
            const jobs = await claimOutboxJobs(manager, {
              workerId,
              limit: 1,
              excludeTypes: otherPendingTypes,
            });
            for (const job of jobs) {
              if (job.lockedAt === null) throw new Error('claimed job missing lockedAt');
              await markOutboxJobSucceeded(manager, job.id, { workerId, lockedAt: job.lockedAt });
            }
            return jobs.length;
          });
          if (claimed === 0) break;
          samples.push(performance.now() - start);
        }
        const report = latencyReport(samples);
        printLatencyReport('federation-delivery (outbox claim -> succeeded)', report);
        expect(report.samples).toBe(nJobs);
      } finally {
        await workerDataSource.destroy();
      }
    });
  },
);
