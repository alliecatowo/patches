import { createHash, randomUUID } from 'node:crypto';

import { credentials as grpcCredentials } from '@grpc/grpc-js';
import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import {
  createAuthClient,
  ERROR_CODE_METADATA_KEY,
  METADATA_KEYS,
  type AuthGrpcClient,
  type GetServerInfoRequest,
  type GetServerInfoResponse,
  type RegisterRequest,
  type RegisterResponse,
} from '@patches/proto';
import { AuthService, SystemService } from '@patches/proto/es';
import { createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { CONNECT_TEST_ALLOWED_ORIGIN } from './support/connect-test-env.js';
import { callUnary, startTestServer, type TestServer } from './support/test-server.js';

/**
 * ADR 0016 Phase A acceptance: the Connect edge answers the same schema as gRPC, byte-
 * proxied to the in-process gRPC server — an anonymous RPC and an authed RPC behave
 * identically over both transports, gRPC status codes map 1:1 onto Connect codes carrying
 * the same `x-patches-error-code`/`x-request-id`, federation stays absent when
 * `FEDERATION_ENABLED=false`, and CORS is scoped to `WEB_ORIGINS`.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping Connect edge integration tests: TEST_DATABASE_URL is not set ' +
      '(start Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'Connect edge (integration, ADR 0016)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let authGrpc: AuthGrpcClient;
    let inviterUserId: string;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `connectinviter${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      });
      inviterUserId = user.id;

      server = await startTestServer({ http: true });
      authGrpc = createAuthClient(server.url, grpcCredentials.createInsecure());
    }, 60_000);

    afterAll(async () => {
      authGrpc.close();
      await server.close();
      await dataSource.destroy();
    });

    function sha256Hex(value: string): string {
      return createHash('sha256').update(value, 'utf8').digest('hex');
    }

    async function mintInvite(): Promise<string> {
      const code = `invite-${randomUUID()}`;
      await dataSource.query(
        'INSERT INTO invites (code_hash, created_by_user_id, max_uses, uses) VALUES ($1, $2, $3, 0)',
        [sha256Hex(code), inviterUserId, 1],
      );
      return code;
    }

    /** Registers a fresh account over gRPC (not the thing under test) and returns its
     * session's access token, for the "an authed RPC works over Connect" assertion. */
    async function registerAndGetAccessToken(): Promise<{ accessToken: string; handle: string }> {
      const handle = `connectuser${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const response = await callUnary<RegisterRequest, RegisterResponse>(
        authGrpc.register.bind(authGrpc),
        {
          handle,
          displayName: 'Connect Edge Test',
          email: `${handle}@example.test`,
          password: 'a-perfectly-fine-password',
          inviteCode: await mintInvite(),
          clientRequestId: randomUUID(),
          sshPublicKey: '',
          privacyNoticeVersionAcknowledged: 0,
        },
      );
      const accessToken = response.session?.accessToken;
      if (accessToken === undefined) throw new Error('register did not return a session');
      return { accessToken, handle };
    }

    function connectTransport(): ReturnType<typeof createConnectTransport> {
      if (server.httpUrl === undefined) throw new Error('httpUrl not set');
      return createConnectTransport({ baseUrl: server.httpUrl, httpVersion: '1.1' });
    }

    it('GetServerInfo (anonymous) answers identically over Connect and gRPC', async () => {
      const grpcResponse = await callUnary<GetServerInfoRequest, GetServerInfoResponse>(
        server.client.getServerInfo.bind(server.client),
        {},
      );

      const client = createClient(SystemService, connectTransport());
      const connectResponse = await client.getServerInfo({});

      expect(connectResponse.serverVersion).toBe(grpcResponse.serverVersion);
      expect(connectResponse.protocolVersion).toBe(grpcResponse.protocolVersion);
      expect(connectResponse.minClientVersion).toBe(grpcResponse.minClientVersion);
      expect(connectResponse.instanceName).toBe(grpcResponse.instanceName);
    });

    it('maps a wrong-password Login to Code.Unauthenticated with the same error code', async () => {
      const { handle } = await registerAndGetAccessToken();
      const client = createClient(AuthService, connectTransport());

      const error = await client
        .login({ emailOrHandle: handle, password: 'definitely-the-wrong-password' })
        .then(
          () => {
            throw new Error('expected Login to reject');
          },
          (caught: unknown) => caught,
        );

      expect(error).toBeInstanceOf(ConnectError);
      const connectError = error as ConnectError;
      expect(connectError.code).toBe(Code.Unauthenticated);
      expect(connectError.metadata.get(ERROR_CODE_METADATA_KEY)).toBe('AUTH_INVALID_CREDENTIALS');
      expect(connectError.metadata.get(METADATA_KEYS.requestId)).toBeTruthy();
    });

    it('answers an authed RPC (GetCurrentSession, Bearer token) over Connect', async () => {
      const { accessToken, handle } = await registerAndGetAccessToken();
      const client = createClient(AuthService, connectTransport());

      const response = await client.getCurrentSession(
        {},
        { headers: { authorization: `Bearer ${accessToken}` } },
      );

      expect(response.actor?.handle).toBe(handle);
    });

    it('rejects GetCurrentSession with no authorization the same way gRPC does', async () => {
      const client = createClient(AuthService, connectTransport());

      const error = await client.getCurrentSession({}).then(
        () => {
          throw new Error('expected GetCurrentSession to reject');
        },
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(ConnectError);
      expect((error as ConnectError).code).toBe(Code.Unauthenticated);
    });

    it('answers 404 for the federation surface when FEDERATION_ENABLED=false', async () => {
      const response = await fetch(`${server.httpUrl}/.well-known/webfinger?resource=acct:x@x`);
      expect(response.status).toBe(404);
    });

    it('keeps GET /healthz working alongside the Connect edge', async () => {
      const response = await fetch(`${server.httpUrl}/healthz`);
      expect(response.status).toBe(200);
    });

    describe('CORS', () => {
      const target = () => `${server.httpUrl}/patches.v1.SystemService/GetServerInfo`;

      it('answers a preflight from an allowed origin with the CORS headers', async () => {
        const response = await fetch(target(), {
          method: 'OPTIONS',
          headers: {
            Origin: CONNECT_TEST_ALLOWED_ORIGIN,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
          },
        });

        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe(
          CONNECT_TEST_ALLOWED_ORIGIN,
        );
        expect(response.headers.get('access-control-allow-methods')).toContain('POST');
        expect(response.headers.get('access-control-allow-credentials')).toBeNull();
      });

      it('answers a preflight from a disallowed origin with no CORS headers', async () => {
        const response = await fetch(target(), {
          method: 'OPTIONS',
          headers: {
            Origin: 'http://not-allowed.test',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
          },
        });

        expect(response.headers.get('access-control-allow-origin')).toBeNull();
      });
    });
  },
);
