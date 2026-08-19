import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestServer, type TestServer } from './support/test-server.js';

/**
 * A-043: `GET /healthz` must report 200 only when the database answers and the gRPC health
 * status is SERVING, and 503 otherwise — answered by `HealthController` on the always-on
 * HTTP listener (ADR 0016 §4). `startTestServer({ http: true })` binds that same listener
 * (plus the Connect edge — see `connect.integration.test.ts`) on a random port.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping /healthz integration test: TEST_DATABASE_URL is not set ' +
      '(start Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'GET /healthz (integration, A-043)',
  () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await startTestServer({ http: true });
    }, 60_000);

    afterAll(async () => {
      await server.close();
    });

    it('reports 200 once the database is reachable and gRPC health is SERVING', async () => {
      const response = await fetch(`${server.httpUrl}/healthz`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string };
      expect(body.status).toBe('ok');
    });

    it('reports 503 once gRPC health flips to NOT_SERVING', async () => {
      server.health.setStatus('NOT_SERVING');
      try {
        const response = await fetch(`${server.httpUrl}/healthz`);
        expect(response.status).toBe(503);
        const body = (await response.json()) as { status: string };
        expect(body.status).toBe('unavailable');
      } finally {
        // Leave the server SERVING for any test that runs after this one in the same file.
        server.health.setStatus('SERVING');
      }
    });

    it('answers 404 for any other path', async () => {
      const response = await fetch(`${server.httpUrl}/not-healthz`);
      expect(response.status).toBe(404);
    });
  },
);
