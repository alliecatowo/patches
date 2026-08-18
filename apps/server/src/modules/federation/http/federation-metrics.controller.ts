import type { IncomingMessage, ServerResponse } from 'node:http';

import { Controller, Get, Req, Res } from '@nestjs/common';

import { AppConfigService } from '../../../config/app-config.service.js';
import { FederationMetricsService } from '../federation-metrics.service.js';

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * `GET /federation/metrics` (A-036): a JSON snapshot of this process's in-memory federation
 * counters (`FederationMetricsService`). Deliberately **loopback-only** rather than gated by a
 * bearer token — the simplest control that still lets an operator `ssh` in and `curl
 * localhost:$HTTP_PORT/federation/metrics`, or front it with a Fly.io private-network proxy,
 * without adding a new secret to provision/rotate (`docs/operations/federation.md` documents
 * how to read it). Also checked even though `main.ts` only ever opens this HTTP listener when
 * `FEDERATION_ENABLED` — defense in depth for anything that constructs the Nest app directly
 * (tests) without going through that gate.
 */
@Controller('federation')
export class FederationMetricsController {
  constructor(
    private readonly metrics: FederationMetricsService,
    private readonly config: AppConfigService,
  ) {}

  @Get('metrics')
  get(@Req() req: IncomingMessage, @Res() res: ServerResponse): void {
    if (!this.config.federationEnabled || !isLoopback(req)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(this.metrics.snapshot()));
  }
}

function isLoopback(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress;
  return address !== undefined && LOOPBACK_ADDRESSES.has(address);
}
