import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { ServerResponse } from 'node:http';

import { ACTIVITY_JSON_CONTENT_TYPE } from '../federation.constants.js';
import {
  OutboxCollectionService,
  type OutboxRejectionReason,
} from '../services/outbox-collection.service.js';

const RESPONSE_BY_REJECTION: Readonly<
  Record<OutboxRejectionReason, { status: number; body?: string }>
> = {
  INVALID_CURSOR: { status: 400, body: 'Invalid "page" cursor.' },
  UNKNOWN_ACTOR: { status: 404 },
};

/** `GET /users/:handle/outbox[?page=…]` (B-027) — the top-level `OrderedCollection` summary,
 * or one keyset `OrderedCollectionPage` of the actor's public posts when `page` is present. */
@Controller('users')
export class OutboxController {
  constructor(private readonly outbox: OutboxCollectionService) {}

  @Get(':handle/outbox')
  async get(
    @Param('handle') handle: string,
    @Query('page') page: string | undefined,
    @Res() res: ServerResponse,
  ): Promise<void> {
    const result = await this.outbox.resolve(handle, page);
    if (result.found) {
      res.statusCode = 200;
      res.setHeader('content-type', ACTIVITY_JSON_CONTENT_TYPE);
      res.end(JSON.stringify(result.document));
      return;
    }
    const response = RESPONSE_BY_REJECTION[result.reason];
    res.statusCode = response.status;
    res.end(response.body);
  }
}
