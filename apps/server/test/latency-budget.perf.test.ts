import { credentials as grpcCredentials } from '@grpc/grpc-js';
import {
  createAuthClient,
  createFeedClient,
  createPostClient,
  type AuthGrpcClient,
  type FeedGrpcClient,
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type ListRepliesRequest,
  type ListRepliesResponse,
  type PostGrpcClient,
} from '@patches/proto';
import { createTestFollow, createTestPost, createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { registerTestActor, testSuffix, type TestActor } from './support/fixtures.js';
import { latencyReport, printLatencyReport } from './support/latency.js';
import { callUnary, startTestServer, type TestServer } from './support/test-server.js';

/**
 * #200 — chronological-feed latency budget and regression gate.
 *
 * `BUDGET_MS` below is not invented: it is the p95 (rounded up) measured by two clean local
 * runs of this same suite on 2026-08-28 (`TEST_DATABASE_URL=... pnpm --filter @patches/server
 * test:perf`, against podman-compose PostgreSQL on this machine — home ~27ms, local ~13ms,
 * thread ~22ms both runs; see `docs/operations/performance.md` "Latency budget" for the exact
 * transcript). The gate asserts `p95 < BUDGET_MS * 2`:
 * a deliberately loose 2x margin (not the 15%-over-noise-band policy `docs/research/
 * contract-load-tooling.md`'s H-028 describes for a full statistical gate with reruns) so a
 * single noisy CI runner never flakes this job. It exists to catch a real regression — an
 * accidental sequential scan, an N+1, a dropped index — not to hold the line on absolute
 * numbers; re-measure and update `BUDGET_MS` (with a fresh run recorded in the doc) if the
 * query shape intentionally changes.
 *
 * Fixture: one viewer following 20 authors who've each posted 10 times (200 posts total) plus
 * one 15-reply thread — enough for the keyset query to do real index work without making the
 * suite itself slow. Same shape as `packages/bench/fixtures.ts`'s default, scaled down since
 * this runs on every perf-suite invocation rather than by hand.
 */

const ITERATIONS = 30;
const BUDGET_MS: Record<'home' | 'local' | 'thread', number> = {
  home: 30,
  local: 15,
  thread: 25,
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping latency-budget perf test: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'chronological-feed latency budget (perf, #200)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let posts: PostGrpcClient;
    let feeds: FeedGrpcClient;
    let viewer: TestActor;
    let threadRootId: string;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `inviter${testSuffix()}`,
      });

      server = await startTestServer();
      auth = createAuthClient(server.url, grpcCredentials.createInsecure());
      posts = createPostClient(server.url, grpcCredentials.createInsecure());
      feeds = createFeedClient(server.url, grpcCredentials.createInsecure());

      viewer = await registerTestActor(auth, dataSource, user.id);

      // Fixture setup is not the thing under test — go straight through the DB factories
      // (same ones `packages/bench/fixtures.ts` uses) rather than 200 real gRPC writes, so
      // the suite's own runtime doesn't dominate `mise run check server`.
      const base = Date.now() - 200 * 60_000;
      let postIndex = 0;
      for (let i = 0; i < 20; i++) {
        const { actor: authorActor } = await createTestUser(dataSource.manager, {
          handle: `latauthor${String(i)}${testSuffix()}`,
        });
        await createTestFollow(dataSource.manager, {
          followerActorId: viewer.actorId,
          followeeActorId: authorActor.id,
        });
        for (let p = 0; p < 10; p++) {
          await createTestPost(dataSource.manager, {
            authorActorId: authorActor.id,
            body: `latency budget fixture post ${String(postIndex)}`,
            createdAt: new Date(base + postIndex * 60_000),
          });
          postIndex += 1;
        }
      }

      const root = await createTestPost(dataSource.manager, {
        authorActorId: viewer.actorId,
        body: 'latency budget fixture thread root',
      });
      threadRootId = root.id;
      for (let r = 0; r < 15; r++) {
        await createTestPost(dataSource.manager, {
          authorActorId: viewer.actorId,
          body: `latency budget fixture reply ${String(r)}`,
          inReplyTo: root,
        });
      }
    }, 60_000);

    afterAll(async () => {
      auth.close();
      posts.close();
      feeds.close();
      await server.close();
      await dataSource.destroy();
    });

    it('home feed p95 stays inside 2x budget', async () => {
      const samples: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        await callUnary<ListHomeFeedRequest, ListHomeFeedResponse>(
          feeds.listHomeFeed.bind(feeds),
          { cursor: '', limit: 20 },
          { accessToken: viewer.accessToken },
        );
        samples.push(performance.now() - start);
      }
      const report = latencyReport(samples);
      printLatencyReport('ListHomeFeed', report);
      expect(report.p95Ms).toBeLessThan(BUDGET_MS.home * 2);
    });

    it('local feed p95 stays inside 2x budget', async () => {
      const samples: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        await callUnary<ListLocalFeedRequest, ListLocalFeedResponse>(
          feeds.listLocalFeed.bind(feeds),
          { cursor: '', limit: 20 },
          { accessToken: viewer.accessToken },
        );
        samples.push(performance.now() - start);
      }
      const report = latencyReport(samples);
      printLatencyReport('ListLocalFeed', report);
      expect(report.p95Ms).toBeLessThan(BUDGET_MS.local * 2);
    });

    it('thread reply p95 stays inside 2x budget', async () => {
      const samples: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        await callUnary<ListRepliesRequest, ListRepliesResponse>(
          posts.listReplies.bind(posts),
          { postId: threadRootId, cursor: '', limit: 20, maxDepth: 5 },
          { accessToken: viewer.accessToken },
        );
        samples.push(performance.now() - start);
      }
      const report = latencyReport(samples);
      printLatencyReport('ListReplies', report);
      expect(report.p95Ms).toBeLessThan(BUDGET_MS.thread * 2);
    });
  },
);
