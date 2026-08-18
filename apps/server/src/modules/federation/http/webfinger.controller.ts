import { Controller, Get, Query, Res } from '@nestjs/common';
import type { ServerResponse } from 'node:http';

import { JRD_JSON_CONTENT_TYPE } from '../federation.constants.js';
import { WebfingerService } from '../services/webfinger.service.js';

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
    if (resource === undefined) {
      res.statusCode = 400;
      res.end('Missing "resource" query parameter.');
      return;
    }
    const jrd = await this.webfinger.resolve(resource);
    if (jrd === undefined) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', JRD_JSON_CONTENT_TYPE);
    res.end(JSON.stringify(jrd));
  }
}
