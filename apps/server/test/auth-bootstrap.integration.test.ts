import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAuthClient,
  type AuthGrpcClient,
  type RegisterRequest,
  type RegisterResponse,
} from '@patches/proto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import {
  callUnary,
  expectRejection,
  startTestServer,
  type TestServer,
} from './support/test-server.js';

/**
 * P1-013: on an invite-only node with no accounts yet, the very first `Register` call must
 * succeed without an invite code; every subsequent one must not. `test/support/env.ts` sets
 * `INVITE_ONLY=true` for the whole integration suite, and `createServerTestDataSource` drops
 * and re-migrates the schema per file, so this file's `users` table starts empty.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping auth bootstrap integration test: TEST_DATABASE_URL is not set ' +
      '(start Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'bootstrap registration over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      server = await startTestServer();
      auth = createAuthClient(server.url, grpcCredentials.createInsecure());
    }, 60_000);

    afterAll(async () => {
      auth.close();
      await server.close();
      await dataSource.destroy();
    });

    beforeEach(async () => {
      // Every test in this file needs a node with exactly zero accounts to exercise the
      // bootstrap path — reset before each test rather than rely on execution order.
      // `RESTART IDENTITY CASCADE` is safe here: `createServerTestDataSource` migrates a
      // fresh schema per file (see the module doc comment above) and nothing else in the
      // suite shares this database.
      await dataSource.query('TRUNCATE TABLE actors, users, credentials RESTART IDENTITY CASCADE');
    });

    function registerRequest(handle: string): RegisterRequest {
      return {
        handle,
        displayName: '',
        email: `${handle}@example.test`,
        password: 'a-perfectly-fine-password',
        inviteCode: '',
        clientRequestId: randomUUID(),
        sshPublicKey: '',
        privacyNoticeVersionAcknowledged: 0,
      };
    }

    it('lets the first registration through without an invite, then requires one', async () => {
      const first = await callUnary<RegisterRequest, RegisterResponse>(
        auth.register.bind(auth),
        registerRequest(`bootstrap${Date.now().toString(36)}`),
      );
      expect(first.session?.actor?.handle).toBeTruthy();

      const error = await expectRejection<RegisterRequest, RegisterResponse>(
        auth.register.bind(auth),
        registerRequest(`second${Date.now().toString(36)}`),
      );
      expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
    });

    it('lets exactly one of two concurrent bootstrap registrations through (A-040)', async () => {
      const settled = await Promise.allSettled([
        callUnary<RegisterRequest, RegisterResponse>(
          auth.register.bind(auth),
          registerRequest(`racea${Date.now().toString(36)}`),
        ),
        callUnary<RegisterRequest, RegisterResponse>(
          auth.register.bind(auth),
          registerRequest(`raceb${Date.now().toString(36)}`),
        ),
      ]);

      const fulfilled = settled.filter(
        (result): result is PromiseFulfilledResult<RegisterResponse> =>
          result.status === 'fulfilled',
      );
      const rejected = settled.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );

      // Without the `pg_advisory_xact_lock` serialising the bootstrap decision, a plain
      // `COUNT` inside READ COMMITTED lets both requests observe zero accounts and both
      // succeed — this is the race A-040 closes.
      expect(fulfilled).toHaveLength(1);
      expect(fulfilled[0]?.value.session?.actor?.handle).toBeTruthy();
      expect(rejected).toHaveLength(1);
      expect((rejected[0]?.reason as { code?: number }).code).toBe(GrpcStatus.INVALID_ARGUMENT);
    });
  },
);
