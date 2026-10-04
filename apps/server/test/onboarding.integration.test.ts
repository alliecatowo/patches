import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAuthClient,
  createFeedClient,
  createNotificationClient,
  createOnboardingClient,
  type AuthGrpcClient,
  type FeedGrpcClient,
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListNotificationsRequest,
  type ListNotificationsResponse,
  type NotificationGrpcClient,
  type OnboardingGrpcClient,
  type RefreshSessionRequest,
  type RefreshSessionResponse,
  type StartDemoRequest,
  type StartDemoResponse,
} from '@patches/proto';
import {
  createTestCommunity,
  createTestConversation,
  createTestConversationMember,
  createTestPost,
  createTestUser,
} from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DemoSandboxService } from '../src/modules/onboarding/demo-sandbox.service.js';
import { createServerTestDataSource } from './support/database.js';
import { testSuffix } from './support/fixtures.js';
import {
  callUnary,
  expectRejection,
  startTestServer,
  type TestServer,
} from './support/test-server.js';

/**
 * ADR 0044: the demo sandbox end to end over real gRPC against real PostgreSQL. The central
 * claims: a visitor gets a seeded, working account; the expiry holds even before the sweep runs;
 * and the sweep leaves no row behind while never touching a real account.
 */

// Must run before the Nest config module is evaluated (imports are hoisted above ordinary
// statements, `vi.hoisted` is not): `DEMO_MODE` is read once, at config-module load. Scoped to
// this file so no other integration suite boots with the demo sweep or its franking-key bootstrap.
vi.hoisted(() => {
  process.env.DEMO_MODE = 'true';
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping onboarding integration tests: TEST_DATABASE_URL is not set.',
  );
}

/** Every table except bookkeeping that legitimately changes (rate-limit counters, migrations). */
async function rowCounts(dataSource: DataSource): Promise<Record<string, number>> {
  const tables = await dataSource.query<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name NOT IN ('migrations', 'rate_limit_buckets')`,
  );
  const counts: Record<string, number> = {};
  for (const { table_name: name } of tables) {
    const rows = await dataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(*) AS n FROM "${name}"`,
    );
    counts[name] = Number(rows[0]?.n ?? 0);
  }
  return counts;
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'demo sandbox over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let onboarding: OnboardingGrpcClient;
    let auth: AuthGrpcClient;
    let feeds: FeedGrpcClient;
    let notifications: NotificationGrpcClient;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      server = await startTestServer();
      const creds = grpcCredentials.createInsecure();
      onboarding = createOnboardingClient(server.url, creds);
      auth = createAuthClient(server.url, creds);
      feeds = createFeedClient(server.url, creds);
      notifications = createNotificationClient(server.url, creds);
    }, 60_000);

    afterAll(async () => {
      onboarding.close();
      auth.close();
      feeds.close();
      notifications.close();
      await server.close();
      await dataSource.destroy();
    });

    const start = (): Promise<StartDemoResponse> =>
      callUnary<StartDemoRequest, StartDemoResponse>(onboarding.startDemo.bind(onboarding), {});

    it('creates a seeded sandbox: visitor, three friends, a populated home feed and inbox', async () => {
      const demo = await start();

      expect(demo.session?.actor?.handle).toMatch(/^you_[0-9a-f]{6}$/);
      expect(demo.friends).toHaveLength(3);
      // The node mints its own franking era (it runs no worker), which is what turns E2EE on.
      // The test server does not fire the bootstrap lifecycle hook, so run it as boot would.
      await server.app.get(DemoSandboxService).ensureFrankingKey();
      const eras = await dataSource.query<Array<{ n: string }>>(
        'SELECT COUNT(*) AS n FROM e2ee_node_franking_keys',
      );
      expect(Number(eras[0]?.n)).toBe(1);
      // Idempotent: a second boot finds the era and mints nothing.
      await server.app.get(DemoSandboxService).ensureFrankingKey();
      const again = await dataSource.query<Array<{ n: string }>>(
        'SELECT COUNT(*) AS n FROM e2ee_node_franking_keys',
      );
      expect(Number(again[0]?.n)).toBe(1);
      expect(demo.expiresAt).toBeDefined();
      const accessToken = demo.session?.accessToken ?? '';

      const home = await callUnary<ListHomeFeedRequest, ListHomeFeedResponse>(
        feeds.listHomeFeed.bind(feeds),
        { cursor: '', limit: 50 },
        { accessToken },
      );
      const authors = new Set(home.posts.map((post) => post.author?.handle.split('_')[0]));
      expect(authors).toEqual(new Set(['maya', 'jun', 'ines', 'you']));
      // Newest first, and back-dated rather than all stamped "now".
      const times = home.posts.map((post) => Number(post.createdAt?.seconds ?? 0));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      expect((times[0] ?? 0) - (times[times.length - 1] ?? 0)).toBeGreaterThan(3 * 3600);

      const inbox = await callUnary<ListNotificationsRequest, ListNotificationsResponse>(
        notifications.listNotifications.bind(notifications),
        { cursor: '', limit: 50 },
        { accessToken },
      );
      expect(inbox.notifications.length).toBeGreaterThanOrEqual(3);
    });

    it('rotates sandbox tokens and ends them at the expiry even before any sweep runs', async () => {
      const demo = await start();
      const handle = demo.session?.actor?.handle ?? '';

      const refreshed = await callUnary<RefreshSessionRequest, RefreshSessionResponse>(
        auth.refreshSession.bind(auth),
        { refreshToken: demo.session?.refreshToken ?? '' },
      );
      const accessToken = refreshed.session?.accessToken ?? '';
      expect(accessToken).not.toBe('');

      // Expire it directly in the database: the node never got to sweep (it was "asleep").
      await dataSource.query(
        `UPDATE users SET sandbox_expires_at = now() - interval '1 second'
         WHERE actor_id = (SELECT id FROM actors WHERE handle = $1)`,
        [handle],
      );

      const call = await expectRejection<ListHomeFeedRequest, ListHomeFeedResponse>(
        feeds.listHomeFeed.bind(feeds),
        { cursor: '', limit: 5 },
        { accessToken },
      );
      expect(call.code).toBe(GrpcStatus.UNAUTHENTICATED);

      const refresh = await expectRejection<RefreshSessionRequest, RefreshSessionResponse>(
        auth.refreshSession.bind(auth),
        { refreshToken: refreshed.session?.refreshToken ?? '' },
      );
      expect(refresh.code).toBe(GrpcStatus.UNAUTHENTICATED);
    });

    it('purges an expired sandbox completely and never touches a real account', async () => {
      const { actor: realActor, user: realUser } = await createTestUser(dataSource.manager, {
        handle: `real${testSuffix()}`,
      });
      const realPost = await createTestPost(dataSource.manager, { authorActorId: realActor.id });
      // Earlier tests may have left expired sandboxes behind; clear them so the baseline is stable.
      await server.app.get(DemoSandboxService).purgeExpired();
      const before = await rowCounts(dataSource);

      const demo = await start();
      const handle = demo.session?.actor?.handle ?? '';
      const [visitor] = await dataSource.query<Array<{ id: string }>>(
        'SELECT id FROM actors WHERE handle = $1',
        [handle],
      );
      // Beyond the seed: things a sandbox visitor can do that hold a RESTRICT foreign key to
      // their account, and a direct conversation with a friend.
      const friendActorId = demo.friends[0]?.session?.actor?.id ?? '';
      await createTestCommunity(dataSource.manager, { createdByActorId: visitor?.id ?? '' });
      const conversation = await createTestConversation(dataSource.manager, {
        createdByActorId: visitor?.id ?? '',
      });
      await createTestConversationMember(dataSource.manager, {
        conversationId: conversation.id,
        actorId: visitor?.id ?? '',
      });
      await createTestConversationMember(dataSource.manager, {
        conversationId: conversation.id,
        actorId: friendActorId,
      });
      expect(await rowCounts(dataSource)).not.toEqual(before);

      const service = server.app.get(DemoSandboxService);
      // Not yet expired: the sweep must leave it alone.
      expect(await service.purgeExpired()).toBe(0);
      expect(
        await dataSource.query('SELECT 1 FROM actors WHERE handle = $1', [handle]),
      ).toHaveLength(1);

      // Expire only this sandbox; the ones earlier tests left running stay live.
      await dataSource.query(
        `UPDATE users SET sandbox_expires_at = now() - interval '1 minute'
         WHERE sandbox_id = (SELECT sandbox_id FROM users WHERE actor_id = $1)`,
        [visitor?.id],
      );
      expect(await service.purgeExpired()).toBe(1);

      // Every table is back to exactly what it was: no orphan from any seed, community,
      // conversation or token row — and the real account, its post and its row are untouched.
      expect(await rowCounts(dataSource)).toEqual(before);
      expect(
        await dataSource.query('SELECT 1 FROM users WHERE id = $1', [realUser.id]),
      ).toHaveLength(1);
      expect(
        await dataSource.query('SELECT 1 FROM posts WHERE id = $1', [realPost.id]),
      ).toHaveLength(1);
    });

    it('rate-limits sandbox creation per peer', async () => {
      const outcomes: Array<number | 'ok'> = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          await start();
          outcomes.push('ok');
        } catch (error) {
          outcomes.push((error as { code?: number }).code ?? -1);
        }
      }
      // DEMO_STARTS_PER_PEER_PER_HOUR defaults to 4 and the earlier tests already spent some.
      expect(outcomes).toContain(GrpcStatus.RESOURCE_EXHAUSTED);
      expect(outcomes[outcomes.length - 1]).toBe(GrpcStatus.RESOURCE_EXHAUSTED);
    });
  },
);
