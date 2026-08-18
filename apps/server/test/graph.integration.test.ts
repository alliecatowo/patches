import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAuthClient,
  createSocialGraphClient,
  type AuthGrpcClient,
  type FollowActorRequest,
  type FollowActorResponse,
  type GetRelationshipRequest,
  type GetRelationshipResponse,
  FOLLOW_STATE,
  type SocialGraphGrpcClient,
  type UnfollowActorRequest,
  type UnfollowActorResponse,
} from '@patches/proto';
import { createTestBlock, createTestUser } from '@patches/testkit';
import { Notification } from '@patches/database';
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
 * `SocialGraphService` end-to-end over real gRPC against real PostgreSQL (spec §118–§119):
 * `FollowActor`/`UnfollowActor` idempotency, self-follow rejection, block-aware rejection, and
 * `GetRelationship`.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping graph integration tests: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'social graph over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let graph: SocialGraphGrpcClient;
    let inviterUserId: string;
    let alice: TestActor;
    let bob: TestActor;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `inviter${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      });
      inviterUserId = user.id;

      server = await startTestServer();
      auth = createAuthClient(server.url, grpcCredentials.createInsecure());
      graph = createSocialGraphClient(server.url, grpcCredentials.createInsecure());

      alice = await registerTestActor(auth, dataSource, inviterUserId, { displayName: 'Alice' });
      bob = await registerTestActor(auth, dataSource, inviterUserId, { displayName: 'Bob' });
    }, 60_000);

    afterAll(async () => {
      auth.close();
      graph.close();
      await server.close();
      await dataSource.destroy();
    });

    describe('FollowActor / UnfollowActor', () => {
      it('follows straight to FOLLOWING and is idempotent (spec §50)', async () => {
        const first = await callUnary<FollowActorRequest, FollowActorResponse>(
          graph.followActor.bind(graph),
          { actorId: bob.actorId },
          { accessToken: alice.accessToken },
        );
        expect(first.relationship?.state).toBe(FOLLOW_STATE.FOLLOWING);

        const second = await callUnary<FollowActorRequest, FollowActorResponse>(
          graph.followActor.bind(graph),
          { actorId: bob.actorId },
          { accessToken: alice.accessToken },
        );
        expect(second.relationship?.state).toBe(FOLLOW_STATE.FOLLOWING);

        const relationship = await callUnary<GetRelationshipRequest, GetRelationshipResponse>(
          graph.getRelationship.bind(graph),
          { actorId: alice.actorId },
          { accessToken: bob.accessToken },
        );
        expect(relationship.relationship?.followedBy).toBe(true);
      });

      it('writes exactly one FOLLOW notification for the followed actor (A-026)', async () => {
        const rows = await dataSource.getRepository(Notification).find({
          where: { recipientActorId: bob.actorId, actorId: alice.actorId, type: 'FOLLOW' },
        });
        expect(rows).toHaveLength(1);
      });

      it('unfollow is idempotent — unfollowing a non-followed actor is not an error', async () => {
        const carol = await registerTestActor(auth, dataSource, inviterUserId, {
          displayName: 'Carol',
        });

        const response = await callUnary<UnfollowActorRequest, UnfollowActorResponse>(
          graph.unfollowActor.bind(graph),
          { actorId: carol.actorId },
          { accessToken: alice.accessToken },
        );
        expect(response.relationship?.state).toBe(FOLLOW_STATE.NONE);
      });

      it('rejects following yourself', async () => {
        const error = await expectRejection<FollowActorRequest, FollowActorResponse>(
          graph.followActor.bind(graph),
          { actorId: alice.actorId },
          { accessToken: alice.accessToken },
        );
        expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      });

      it('rejects a follow blocked in either direction with PERMISSION_DENIED (spec §62)', async () => {
        const dave = await registerTestActor(auth, dataSource, inviterUserId, {
          displayName: 'Dave',
        });
        await createTestBlock(dataSource.manager, {
          blockerActorId: dave.actorId,
          blockedActorId: alice.actorId,
        });

        const error = await expectRejection<FollowActorRequest, FollowActorResponse>(
          graph.followActor.bind(graph),
          { actorId: dave.actorId },
          { accessToken: alice.accessToken },
        );
        expect(error.code).toBe(GrpcStatus.PERMISSION_DENIED);
      });

      it('rejects an unauthenticated caller with UNAUTHENTICATED', async () => {
        const error = await expectRejection<FollowActorRequest, FollowActorResponse>(
          graph.followActor.bind(graph),
          { actorId: bob.actorId },
        );
        expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
      });
    });
  },
);
