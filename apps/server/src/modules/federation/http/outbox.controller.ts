import type { ServerResponse } from 'node:http';

import { Controller, Get, Param, Res } from '@nestjs/common';

import { ACTIVITY_JSON_CONTENT_TYPE } from '../federation.constants.js';
import { OutboxCollectionService } from '../services/outbox-collection.service.js';

/** `GET /users/:handle/outbox` (P8-002) — `OrderedCollection` of the actor's public posts. */
@Controller('users')
export class OutboxController {
  constructor(private readonly outbox: OutboxCollectionService) {}

  @Get(':handle/outbox')
  async get(@Param('handle') handle: string, @Res() res: ServerResponse): Promise<void> {
    const collection = await this.outbox.buildOutbox(handle.toLowerCase());
    if (collection === undefined) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', ACTIVITY_JSON_CONTENT_TYPE);
    res.end(JSON.stringify(collection));
  }
}
