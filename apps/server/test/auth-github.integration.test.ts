// Must be the first import — see the module's own doc comment for why: it sets
// `process.env.GITHUB_*` as an import-time side effect, before `./support/test-server.js`
// (below) ever pulls in `AppConfigModule`.
import { FAKE_GITHUB_PORT, FAKE_GITHUB_URL } from './support/github-fake-env.js';

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  type AuthGrpcClient,
  type BeginGitHubLoginRequest,
  type BeginGitHubLoginResponse,
  createAuthClient,
  type PollGitHubLoginRequest,
  type PollGitHubLoginResponse,
  type RegisterRequest,
  type RegisterResponse,
} from '@patches/proto';
// Runtime enum value, not `@patches/proto`'s type-only re-export — see LEARNINGS:
// proto-nestjs-value-export-leak (the value form pulls in @nestjs/microservices, fine for
// this CJS server-side test, not for the ESM TUI bundle).
import { GitHubLoginStatus } from '@patches/proto/nest';
import { createTestUser } from '@patches/testkit';
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
 * GitHub OAuth device-flow login (P6-005, spec §167), end to end over real gRPC — but against
 * a tiny local fake of GitHub's two device-flow endpoints and its `/user` endpoint, never the
 * real github.com. `GITHUB_CLIENT_ID`/`GITHUB_DEVICE_CODE_URL`/`GITHUB_TOKEN_URL`/
 * `GITHUB_USER_API_URL` are set before `startTestServer()` boots the app, which is the only
 * point at which `AppConfigModule`'s `validate` reads them (see `auth.guard.ts`'s sibling
 * suite, `auth.integration.test.ts`, for the "unconfigured" behavior this file does not
 * re-test).
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'GitHub device-flow login over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let fakeGitHub: Server;
    let server: TestServer;
    let auth: AuthGrpcClient;

    /** The numeric GitHub account id the fake `/user` endpoint answers with for whichever
     * poll is currently in flight — mutable so each test can pick its own id (tests run
     * sequentially, never concurrently, within this file). The "link, then log back in"
     * test relies on this staying the *same* value across its two separate device-flow
     * attempts (§167's identifier rule: the same numeric id always resolves to the same
     * Patches account); the "nobody has linked this" test deliberately picks a fresh one. */
    let githubAccountId = 918_273_645;
    /** Every device code the fake server hands out returns PENDING for its first poll and
     * SUCCESS from the second poll onward — enough to exercise both states without a real
     * wait. */
    const pollCounts = new Map<string, number>();

    beforeAll(async () => {
      fakeGitHub = await startFakeGitHub();
      dataSource = await createServerTestDataSource();
      server = await startTestServer();
      auth = createAuthClient(server.url, grpcCredentials.createInsecure());
    }, 60_000);

    afterAll(async () => {
      auth.close();
      await server.close();
      await dataSource.destroy();
      await new Promise<void>((resolve) => {
        fakeGitHub.close(() => {
          resolve();
        });
      });
    });

    function suffix(): string {
      return randomUUID().replace(/-/g, '').slice(0, 10);
    }

    async function register(): Promise<{ accessToken: string }> {
      const handle = `user${suffix()}`;
      const response = await callUnary<RegisterRequest, RegisterResponse>(
        auth.register.bind(auth),
        {
          handle,
          displayName: 'GitHub Linker',
          email: `${handle}@example.test`,
          password: 'a-perfectly-fine-password',
          inviteCode: await mintInvite(),
          clientRequestId: randomUUID(),
          sshPublicKey: '',
        },
      );
      return { accessToken: response.session?.accessToken ?? '' };
    }

    async function mintInvite(): Promise<string> {
      const code = `invite-${randomUUID()}`;
      const { user: inviter } = await createTestUser(dataSource.manager, {
        handle: `ghinviter${suffix()}`,
      });
      await dataSource.query(
        'INSERT INTO invites (code_hash, created_by_user_id, max_uses, uses) VALUES ($1, $2, 1, 0)',
        [createHash('sha256').update(code, 'utf8').digest('hex'), inviter.id],
      );
      return code;
    }

    async function pollUntilPending(deviceCode: string): Promise<PollGitHubLoginResponse> {
      const first = await callUnary<PollGitHubLoginRequest, PollGitHubLoginResponse>(
        auth.pollGitHubLogin.bind(auth),
        { deviceCode },
      );
      expect(first.status).toBe(GitHubLoginStatus.GIT_HUB_LOGIN_STATUS_PENDING);
      return first;
    }

    // ------------------------------------------------------------------ tests

    it('links GitHub to an authenticated session, then logs it back in anonymously', async () => {
      const { accessToken } = await register();

      const begun = await callUnary<BeginGitHubLoginRequest, BeginGitHubLoginResponse>(
        auth.beginGitHubLogin.bind(auth),
        {},
        { accessToken },
      );
      expect(begun.deviceCode.length).toBeGreaterThan(0);
      expect(begun.userCode.length).toBeGreaterThan(0);

      await pollUntilPending(begun.deviceCode);

      // The fake server's own interval is effectively 0, so this poll reaches GitHub's
      // "second call" branch and completes.
      const completed = await callUnary<PollGitHubLoginRequest, PollGitHubLoginResponse>(
        auth.pollGitHubLogin.bind(auth),
        { deviceCode: begun.deviceCode },
      );
      expect(completed.status).toBe(GitHubLoginStatus.GIT_HUB_LOGIN_STATUS_COMPLETE);
      expect(completed.session?.actor?.id).toBeDefined();

      // A second, fully anonymous device-flow login with the same GitHub account now signs
      // into the *same* Patches account, with no session/link step at all.
      const beganAnon = await callUnary<BeginGitHubLoginRequest, BeginGitHubLoginResponse>(
        auth.beginGitHubLogin.bind(auth),
        {},
      );
      await pollUntilPending(beganAnon.deviceCode);
      const loggedIn = await callUnary<PollGitHubLoginRequest, PollGitHubLoginResponse>(
        auth.pollGitHubLogin.bind(auth),
        { deviceCode: beganAnon.deviceCode },
      );
      expect(loggedIn.status).toBe(GitHubLoginStatus.GIT_HUB_LOGIN_STATUS_COMPLETE);
      expect(loggedIn.session?.actor?.id).toBe(completed.session?.actor?.id);
    });

    it('refuses an anonymous login for a GitHub account nobody has linked', async () => {
      githubAccountId = 111_222_333; // a fresh id the previous test never touched
      const begun = await callUnary<BeginGitHubLoginRequest, BeginGitHubLoginResponse>(
        auth.beginGitHubLogin.bind(auth),
        {},
      );
      await pollUntilPending(begun.deviceCode);

      const error = await expectRejection<PollGitHubLoginRequest, PollGitHubLoginResponse>(
        auth.pollGitHubLogin.bind(auth),
        { deviceCode: begun.deviceCode },
      );
      expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
    });

    it('answers EXPIRED for an unknown/already-consumed device code', async () => {
      const result = await callUnary<PollGitHubLoginRequest, PollGitHubLoginResponse>(
        auth.pollGitHubLogin.bind(auth),
        { deviceCode: `never-issued-${suffix()}` },
      );
      expect(result.status).toBe(GitHubLoginStatus.GIT_HUB_LOGIN_STATUS_EXPIRED);
    });

    // ------------------------------------------------------------------ fake GitHub

    async function startFakeGitHub(): Promise<Server> {
      return new Promise((resolve, reject) => {
        const httpServer = createServer((request, response) => {
          handleFakeGitHubRequest(request, response).catch((error: unknown) => {
            response.writeHead(500).end(String(error));
          });
        });
        httpServer.once('error', reject);
        httpServer.listen(FAKE_GITHUB_PORT, '127.0.0.1', () => {
          resolve(httpServer);
        });
      });
    }

    async function handleFakeGitHubRequest(
      request: IncomingMessage,
      response: ServerResponse,
    ): Promise<void> {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      response.setHeader('content-type', 'application/json');

      if (request.method === 'POST' && url.pathname === '/login/device/code') {
        const deviceCode = `dev-${randomUUID()}`;
        pollCounts.set(deviceCode, 0);
        response.end(
          JSON.stringify({
            device_code: deviceCode,
            user_code: `USR-${suffix().toUpperCase()}`,
            verification_uri: `${FAKE_GITHUB_URL}/login/device`,
            expires_in: 600,
            interval: 0,
          }),
        );
        return;
      }

      if (request.method === 'POST' && url.pathname === '/login/oauth/access_token') {
        const body = await readBody(request);
        const params = new URLSearchParams(body);
        const deviceCode = params.get('device_code') ?? '';
        const count = pollCounts.get(deviceCode) ?? 0;
        pollCounts.set(deviceCode, count + 1);

        if (count === 0) {
          response.end(JSON.stringify({ error: 'authorization_pending' }));
          return;
        }
        response.end(
          JSON.stringify({ access_token: `gh-token-${deviceCode}`, token_type: 'bearer' }),
        );
        return;
      }

      if (request.method === 'GET' && url.pathname === '/user') {
        response.end(JSON.stringify({ id: githubAccountId, login: 'octocat-test' }));
        return;
      }

      response.writeHead(404).end('{}');
    }

    async function readBody(request: IncomingMessage): Promise<string> {
      const chunks: Buffer[] = [];
      for await (const chunk of request as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString('utf8');
    }
  },
);
