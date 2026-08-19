import { createServer, type Server } from 'node:http';

import { type HealthCheckResult } from './health.service.js';
import { writeHealthzResponse } from './healthz-response.js';

/**
 * A standalone `GET /healthz`-only HTTP server, deliberately **not** Nest's own HTTP
 * adapter (A-043).
 *
 * `AppModule` imports `FederationModule` unconditionally, and its controllers
 * (webfinger/actor/inbox/outbox) only stay unreachable today because `main.ts` never calls
 * `app.listen()` when `FEDERATION_ENABLED=false` — none of them re-check the flag themselves
 * (unlike `FederationMetricsController`). Calling `app.listen(HTTP_PORT)` unconditionally to
 * serve `/healthz` would therefore also open the federation HTTP surface on every node,
 * contradicting `env.schema.ts`'s documented invariant that federation-off means "zero new
 * network surface, not a smaller one" (spec §176). This tiny server binds the same port with
 * only the one route instead, so `/healthz` becomes always-on without changing that.
 *
 * `main.ts` and `test/support/test-server.ts` both use it when `FEDERATION_ENABLED=false`;
 * when federation is on, `main.ts` calls `app.listen()` instead and `HealthController`
 * answers `/healthz` from the full app on the same port.
 */
export function createHealthzServer(check: () => Promise<HealthCheckResult>): Server {
  return createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/healthz') {
      res.statusCode = 404;
      res.end();
      return;
    }
    check()
      .then((result) => {
        writeHealthzResponse(res, result);
      })
      .catch((error: unknown) => {
        res.statusCode = 503;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ status: 'unavailable', error: String(error) }));
      });
  });
}

/** Promisified `server.listen(port, host)`, resolving once the socket is bound. */
export async function listenHealthzServer(
  server: Server,
  port: number,
  host = '0.0.0.0',
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

/** Promisified `server.close()`. */
export async function closeHealthzServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
