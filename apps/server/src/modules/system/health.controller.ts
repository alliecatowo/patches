import type { ServerResponse } from 'node:http';

import { Controller, Get, Res } from '@nestjs/common';

import { HealthService } from './health.service.js';
import { writeHealthzResponse } from './healthz-response.js';

/**
 * `GET /healthz` (A-043) bound on Nest's own HTTP adapter, which is now always-on (ADR 0016
 * §4 — `main.ts` calls `app.listen()` unconditionally). What stays conditional on
 * `FEDERATION_ENABLED` is `FederationHttpModule` (webfinger/actor/inbox/outbox) being
 * registered at all, not this adapter itself — see `app.module.ts`.
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
