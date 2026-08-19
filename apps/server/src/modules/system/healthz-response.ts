import type { ServerResponse } from 'node:http';

import { type HealthCheckResult } from './health.service.js';

/** `HealthController`'s `GET /healthz` response body/status (A-043). */
export function writeHealthzResponse(res: ServerResponse, result: HealthCheckResult): void {
  res.statusCode = result.ok ? 200 : 503;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ status: result.ok ? 'ok' : 'unavailable' }));
}
