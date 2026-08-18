import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAuthClient,
  type AuthGrpcClient,
  type RegisterRequest,
  type RegisterResponse,
} from '@patches/proto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

    function registerRequest(handle: string): RegisterRequest {
      return {
        handle,
        displayName: '',
        email: `${handle}@example.test`,
        password: 'a-perfectly-fine-password',
        inviteCode: '',
        clientRequestId: randomUUID(),
        sshPublicKey: '',
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
  },
);
