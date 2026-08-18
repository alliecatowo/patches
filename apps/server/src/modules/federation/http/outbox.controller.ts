import type { ServerResponse } from 'node:http';

import { Controller, Get, Param, Query, Res } from '@nestjs/common';

import { AppError } from '../../../common/errors/app-error.js';
import { ACTIVITY_JSON_CONTENT_TYPE } from '../federation.constants.js';
import { OutboxCollectionService } from '../services/outbox-collection.service.js';

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
    const handleNormalized = handle.toLowerCase();
    let document;
    try {
      document =
        page === undefined
          ? await this.outbox.buildCollection(handleNormalized)
          : await this.outbox.buildPage(handleNormalized, page);
    } catch (error) {
      if (error instanceof AppError && error.code === 'VALIDATION_ERROR') {
        res.statusCode = 400;
        res.end('Invalid "page" cursor.');
        return;
      }
      throw error;
    }

    if (document === undefined) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', ACTIVITY_JSON_CONTENT_TYPE);
    res.end(JSON.stringify(document));
  }
}
