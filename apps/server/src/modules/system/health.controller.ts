import type { ServerResponse } from 'node:http';

import { Controller, Get, Res } from '@nestjs/common';

import { HealthService } from './health.service.js';
import { writeHealthzResponse } from './healthz-response.js';

/**
 * `GET /healthz` (A-043) bound on Nest's own HTTP adapter — reachable only when the full
 * hybrid app actually listens, i.e. only when `FEDERATION_ENABLED=true` (`main.ts`). On a
 * node with federation off, `main.ts` never opens this adapter's port at all (spec §176's
 * "zero new network surface" — see `env.schema.ts`'s `FEDERATION_ENABLED` comment); it
 * instead binds the same `HealthService` behind `healthz-server.ts`'s standalone listener, so
 * `/healthz` is always reachable without ever exposing the federation HTTP surface
 * (webfinger/actor/inbox/outbox) that shares this adapter.
 */
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('healthz')
  async get(@Res() res: ServerResponse): Promise<void> {
    const result = await this.health.check();
    writeHealthzResponse(res, result);
  }
}
