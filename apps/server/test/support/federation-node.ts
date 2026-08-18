import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { credentials } from '@grpc/grpc-js';
import {
  createAuthClient,
  createFeedClient,
  createPostClient,
  createSocialGraphClient,
  type AuthGrpcClient,
  type FeedGrpcClient,
  type PostGrpcClient,
  type SocialGraphGrpcClient,
} from '@patches/proto';
import { createDataSource, runMigrationsForTests } from '@patches/database';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import type { DataSource } from 'typeorm';

/**
 * Ask the OS for a free TCP port by binding and immediately releasing one — same technique
 * as `test-server.ts`'s private `freePort`, duplicated here since this file needs *two* free
 * ports (gRPC + HTTP) per node and that helper isn't exported.
 */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close(() => {
          reject(new Error('could not determine a free port'));
        });
        return;
      }
      const { port } = address;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

export interface FederationTestNode {
  /** e.g. `http://127.0.0.1:41234` — this node's federation identity/origin. */
  publicOrigin: string;
  /** A direct connection to this node's own database — for test fixtures/assertions only,
   * never shared with the running node process itself (see the module doc comment on why
   * this file spawns a real child process instead of booting `AppModule` in-process). */
  dataSource: DataSource;
  /** B-026: this node's own `FEDERATION_KEY_ENCRYPTION_KEY` — `drainFederationDeliveries`
   * needs it to decrypt the `federation_keys` rows this node's own `KeyService` encrypted. */
  federationKeyEncryptionKey: string;
  auth: AuthGrpcClient;
  graph: SocialGraphGrpcClient;
  posts: PostGrpcClient;
  feeds: FeedGrpcClient;
  close(): Promise<void>;
}

export interface StartFederationNodeOptions {
  /** Must be a real, already-created, empty-or-droppable Postgres database — distinct per
   * node (P8-008: two nodes never share a database). */
  databaseUrl: string;
  /** This node's canonical domain (`NODE_DOMAIN`, spec §163) — distinct per node. */
  nodeDomain: string;
}

const SERVER_ROOT = join(__dirname, '../..');
const MAIN_JS = join(SERVER_ROOT, 'dist/main.js');

/**
 * Boots a full hybrid Patches node (gRPC + the federation HTTP surface,
 * `FEDERATION_ENABLED=true`) as a **real, separate OS process** running the already-built
 * `dist/main.js` (P8-008 — `pnpm --filter @patches/server build` must have run first, same
 * artifact `pnpm start` uses in production).
 *
 * This is a real process, not an in-process `NestFactory.create(AppModule)` call, for a load-
 * bearing reason discovered while building this test: `@nestjs/config`'s `ConfigModule.forRoot
 * ({validate})` evaluates `validate(process.env)` **exactly once per process** — the call sits
 * inside `AppConfigModule`'s `@Module({imports: [ConfigModule.forRoot(...)]})` decorator
 * argument, which JS evaluates once, the first time `config.module.ts` is imported, not once
 * per `NestFactory.create()` call. Every environment variable with a zod default (`INVITE_
 * ONLY`, `FEDERATION_ENABLED`, `PUBLIC_ORIGIN`, ...) gets permanently frozen to whatever it
 * resolved to at that first, early import — usually before any test code has run — and two
 * `NestFactory.create(AppModule)` calls in one process silently share that one frozen
 * snapshot for every defaulted key, including `DATABASE_URL` once `apps/server/test/support/
 * setup-env.mts` has already set it once for the whole file. A real child process has its own
 * `process.env` from the start, sidestepping the whole class of bug — and is arguably the more
 * faithful test of "two independently-configured nodes" besides.
 */
export async function startFederationNode(
  options: StartFederationNodeOptions,
): Promise<FederationTestNode> {
  const grpcPort = await freePort();
  const httpPort = await freePort();
  const publicOrigin = `http://127.0.0.1:${String(httpPort)}`;

  const { publicKey, privateKey } = await generateKeyPair('EdDSA', {
    crv: 'Ed25519',
    extractable: true,
  });

  const dataSource = createDataSource({ url: options.databaseUrl });
  await dataSource.initialize();
  await dataSource.dropDatabase();
  await runMigrationsForTests(dataSource);

  const grpcUrl = `127.0.0.1:${String(grpcPort)}`;
  // B-026: FEDERATION_ENABLED=true now requires this — a fresh key per node/run, exactly like
  // the JWT keypair generated just above.
  const federationKeyEncryptionKey = randomBytes(32).toString('base64');

  const child = spawn(process.execPath, [MAIN_JS], {
    cwd: SERVER_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: options.databaseUrl,
      NODE_DOMAIN: options.nodeDomain,
      PUBLIC_ORIGIN: publicOrigin,
      FEDERATION_ENABLED: 'true',
      FEDERATION_KEY_ENCRYPTION_KEY: federationKeyEncryptionKey,
      HTTP_PORT: String(httpPort),
      GRPC_HOST: '127.0.0.1',
      GRPC_PORT: String(grpcPort),
      INVITE_ONLY: 'false',
      JWT_PRIVATE_KEY: Buffer.from(await exportPKCS8(privateKey)).toString('base64'),
      JWT_PUBLIC_KEY: Buffer.from(await exportSPKI(publicKey)).toString('base64'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderrTail = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4000);
  });
  child.once('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(
        `federation test node (${options.nodeDomain}) exited with code ${String(code)}:\n${stderrTail}`,
      );
    }
  });

  await waitForHttpReady(publicOrigin, child);

  return {
    publicOrigin,
    dataSource,
    federationKeyEncryptionKey,
    auth: createAuthClient(grpcUrl, credentials.createInsecure()),
    graph: createSocialGraphClient(grpcUrl, credentials.createInsecure()),
    posts: createPostClient(grpcUrl, credentials.createInsecure()),
    feeds: createFeedClient(grpcUrl, credentials.createInsecure()),
    close: async () => {
      await stopChild(child);
      await dataSource.destroy();
    },
  };
}

/** Polls the federation HTTP surface until it answers — any response (even a 4xx) means the
 * server is up; a connection refusal means "not listening yet". */
async function waitForHttpReady(
  origin: string,
  child: ChildProcess,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(
        `federation test node exited during startup (code ${String(child.exitCode)}).`,
      );
    }
    try {
      await fetch(`${origin}/.well-known/webfinger`);
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error(`federation test node at ${origin} did not become ready in time.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve();
    });
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 3000);
  });
}
