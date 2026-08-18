import { createServer } from 'node:net';

import { credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions } from '@nestjs/microservices';
import {
  createSystemClient,
  DEADLINES_MS,
  METADATA_KEYS,
  type SystemGrpcClient,
} from '@patches/proto';

import { AppModule } from '../../src/app.module.js';
import { createGrpcMicroservice } from '../../src/grpc-options.js';
import { prepareServerEnv } from './env.js';

export { prepareServerEnv, TEST_NODE_DOMAIN } from './env.js';

export interface TestServer {
  url: string;
  client: SystemGrpcClient;
  close(): Promise<void>;
}

/** Ask the OS for a free TCP port by binding and immediately releasing one. */
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

/** Boot the real Nest microservice on a random port with a real grpc-js client. */
export async function startTestServer(): Promise<TestServer> {
  await prepareServerEnv();
  const port = await freePort();
  const url = `127.0.0.1:${String(port)}`;
  const { options, health } = createGrpcMicroservice(url);

  // Mirrors `src/main.ts` exactly — a hybrid app with gRPC attached via `connectMicroservice`
  // and `inheritAppConfig: true`. Booting with `NestFactory.createMicroservice` here once let
  // a production-only bug through: without `inheritAppConfig`, the connected microservice
  // silently drops the global APP_FILTER/APP_INTERCEPTOR providers, so every AppError reached
  // clients as INTERNAL. The HTTP listener is never started in tests.
  const app = await NestFactory.create(AppModule, {
    logger: false,
    // Surface a failed boot (e.g. missing DATABASE_URL) as a rejected promise with a
    // readable message instead of Nest's default `process.abort()`, which Vitest can only
    // report as "Worker exited unexpectedly".
    abortOnError: false,
  });
  app.connectMicroservice<MicroserviceOptions>(options, { inheritAppConfig: true });
  await app.startAllMicroservices();
  health.setStatus('SERVING');

  const client = createSystemClient(url, credentials.createInsecure());

  return {
    url,
    client,
    close: async () => {
      client.close();
      await closeQuietly(app);
    },
  };
}

async function closeQuietly(app: INestApplication): Promise<void> {
  await app.close();
}

export interface CallOverrides {
  requestId?: string;
  client?: string;
  clientVersion?: string;
  deadlineMs?: number;
  /** Sent as `authorization: Bearer <token>`, which is what `AuthGuard` reads (spec §35). */
  accessToken?: string;
}

export function metadataFor(overrides: CallOverrides = {}): Metadata {
  const metadata = new Metadata();
  metadata.set(METADATA_KEYS.requestId, overrides.requestId ?? 'test-request-id');
  metadata.set(METADATA_KEYS.client, overrides.client ?? 'tui');
  if (overrides.clientVersion !== undefined) {
    metadata.set(METADATA_KEYS.clientVersion, overrides.clientVersion);
  }
  if (overrides.accessToken !== undefined) {
    metadata.set('authorization', `Bearer ${overrides.accessToken}`);
  }
  return metadata;
}

/** Promisified unary call that always carries a deadline (spec §44). */
export async function callUnary<Request, Response>(
  method: (
    request: Request,
    metadata: Metadata,
    options: { deadline: Date },
    callback: (error: ServiceError | null, response?: Response) => void,
  ) => unknown,
  request: Request,
  overrides: CallOverrides = {},
): Promise<Response> {
  const deadline = new Date(Date.now() + (overrides.deadlineMs ?? DEADLINES_MS.unary));
  return new Promise<Response>((resolve, reject) => {
    method(request, metadataFor(overrides), { deadline }, (error, response) => {
      if (error !== null) {
        reject(error);
        return;
      }
      if (response === undefined) {
        reject(new Error('gRPC call resolved with neither error nor response'));
        return;
      }
      resolve(response);
    });
  });
}

/** Await a call that is expected to fail, returning the gRPC error. */
export async function expectRejection<Request, Response>(
  method: (
    request: Request,
    metadata: Metadata,
    options: { deadline: Date },
    callback: (error: ServiceError | null, response?: Response) => void,
  ) => unknown,
  request: Request,
  overrides: CallOverrides = {},
): Promise<ServiceError> {
  try {
    await callUnary<Request, Response>(method, request, overrides);
  } catch (error) {
    return error as ServiceError;
  }
  throw new Error('expected the RPC to fail, but it succeeded');
}
