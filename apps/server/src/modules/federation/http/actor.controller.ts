import type { ServerResponse } from 'node:http';

import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Page, PageRevision } from '@patches/database';
import { DataSource } from 'typeorm';

import { ACTIVITY_JSON_CONTENT_TYPE } from '../federation.constants.js';
import { acceptsActivityJson } from './content-negotiation.js';
import { ActorDocumentService } from '../services/actor-document.service.js';

/** Actor document + Page-manifest fetch target (P8-001, P8-007). */
@Controller('users')
export class ActorController {
  constructor(
    private readonly actorDocuments: ActorDocumentService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get(':handle')
  async get(
    @Param('handle') handle: string,
    @Headers('accept') accept: string | undefined,
    @Res() res: ServerResponse,
  ): Promise<void> {
    if (!acceptsActivityJson(accept)) {
      res.statusCode = 406;
      res.end();
      return;
    }
    const document = await this.actorDocuments.buildForHandle(handle.toLowerCase());
    if (document === undefined) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', ACTIVITY_JSON_CONTENT_TYPE);
    res.end(JSON.stringify(document));
  }

  /** `docs/architecture/federation.md` §7.5: the URL the actor document's `pageManifest`
   * extension property advertises. Returns the actor's Page document verbatim (the bounded
   * `PatchesPage` JSON already validated strict-on-write, `packages/domain`) — never
   * re-wrapped in AS2, since a Page is inert data, not an ActivityStreams object. `PUBLIC`
   * only; `UNLISTED`/missing both render as a plain `404`. */
  @Get(':handle/page')
  async getPage(@Param('handle') handle: string, @Res() res: ServerResponse): Promise<void> {
    const page = await this.dataSource
      .getRepository(Page)
      .createQueryBuilder('page')
      .innerJoin('page.actor', 'actor')
      .where('actor.handleNormalized = :handle', { handle: handle.toLowerCase() })
      .andWhere('actor.isLocal = true')
      .andWhere('page.visibility = :visibility', { visibility: 'PUBLIC' })
      .getOne();
    if (page === null || page.currentRevisionId === null) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const revision = await this.dataSource
      .getRepository(PageRevision)
      .findOne({ where: { id: page.currentRevisionId } });
    if (revision === null) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(revision.document));
  }
}
