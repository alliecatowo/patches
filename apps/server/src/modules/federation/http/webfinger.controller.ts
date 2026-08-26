import { Controller, Get, Query, Res } from '@nestjs/common';
import type { ServerResponse } from 'node:http';

import { JRD_JSON_CONTENT_TYPE } from '../federation.constants.js';
import { WebfingerService, type WebfingerRejectionReason } from '../services/webfinger.service.js';

const RESPONSE_BY_REJECTION: Readonly<
  Record<WebfingerRejectionReason, { status: number; body?: string }>
> = {
  MISSING_RESOURCE: { status: 400, body: 'Missing "resource" query parameter.' },
  UNKNOWN_RESOURCE: { status: 404 },
};

/** RFC 7033 (P8-001). Registered unconditionally on the federation HTTP app — reachable only
 * when that app is running, i.e. only when `FEDERATION_ENABLED=true` (`main.ts`). */
@Controller()
export class WebfingerController {
  constructor(private readonly webfinger: WebfingerService) {}

  @Get('.well-known/webfinger')
  async get(
    @Query('resource') resource: string | undefined,
    @Res() res: ServerResponse,
  ): Promise<void> {
    const result = await this.webfinger.resolveResource(resource);
    if (result.resolved) {
      res.statusCode = 200;
      res.setHeader('content-type', JRD_JSON_CONTENT_TYPE);
      res.end(JSON.stringify(result.jrd));
      return;
    }
    const response = RESPONSE_BY_REJECTION[result.reason];
    res.statusCode = response.status;
    res.end(response.body);
  }
}
