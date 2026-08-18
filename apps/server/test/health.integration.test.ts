import {
  type Client,
  credentials,
  makeClientConstructor,
  Metadata,
  type ServiceError,
} from '@grpc/grpc-js';
import { service as healthServiceDefinition } from 'grpc-health-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestServer, type TestServer } from './support/test-server.js';

interface HealthClient extends Client {
  check: (
    request: { service: string },
    metadata: Metadata,
    options: { deadline: Date },
    callback: (error: ServiceError | null, response?: { status: string }) => void,
  ) => unknown;
}

let server: TestServer;
let health: HealthClient;

beforeAll(async () => {
  server = await startTestServer();
  const HealthClientCtor = makeClientConstructor(healthServiceDefinition, 'Health');
  health = new HealthClientCtor(
    server.url,
    credentials.createInsecure(),
  ) as unknown as HealthClient;
});

afterAll(async () => {
  health.close();
  await server.close();
});

describe('grpc.health.v1.Health (spec §89)', () => {
  it('reports SERVING once the microservice is listening', async () => {
    const response = await new Promise<{ status: string }>((resolve, reject) => {
      health.check(
        { service: '' },
        new Metadata(),
        { deadline: new Date(Date.now() + 5_000) },
        (error, value) => {
          if (error !== null) reject(error);
          else if (value === undefined) reject(new Error('empty health response'));
          else resolve(value);
        },
      );
    });

    // The standard health service is attached to the raw grpc.Server through
    // Nest's `onLoadPackageDefinition` hook — Nest has no abstraction for it.
    expect(response.status).toBe('SERVING');
  });
});
