import type { ServerResponse } from 'node:http';

import { Controller, Get, Headers, Param, Res } from '@nestjs/common';

import { PageService } from '../../pages/pages.service.js';
import { ACTIVITY_JSON_CONTENT_TYPE } from '../federation.constants.js';
import {
  ActorDocumentService,
  type ActorDocumentRejectionReason,
} from '../services/actor-document.service.js';

const STATUS_BY_REJECTION: Readonly<Record<ActorDocumentRejectionReason, number>> = {
  NOT_ACCEPTABLE: 406,
  UNKNOWN_ACTOR: 404,
};

/** Actor document + Page-manifest fetch target (P8-001, P8-007). */
@Controller('users')
export class ActorController {
  constructor(
    private readonly actorDocuments: ActorDocumentService,
    private readonly pages: PageService,
  ) {}

  @Get(':handle')
  async get(
    @Param('handle') handle: string,
    @Headers('accept') accept: string | undefined,
    @Res() res: ServerResponse,
  ): Promise<void> {
    const result = await this.actorDocuments.resolveForRequest(handle, accept);
    if (result.found) {
      res.statusCode = 200;
      res.setHeader('content-type', ACTIVITY_JSON_CONTENT_TYPE);
      res.end(JSON.stringify(result.document));
      return;
    }
    res.statusCode = STATUS_BY_REJECTION[result.reason];
    res.end();
  }

  /** `docs/architecture/federation.md` §7.5: the URL the actor document's `pageManifest`
   * extension property advertises. Returns the actor's Page document verbatim (the bounded
   * `PatchesPage` JSON already validated strict-on-write, `packages/domain`) — never
   * re-wrapped in AS2, since a Page is inert data, not an ActivityStreams object. `PUBLIC`
   * only; `UNLISTED`/missing both render as a plain `404`. Transport-only (spec §128) — the
   * query itself lives in `PageService.getPublicPageDocument` (A-032). */
  @Get(':handle/page')
  async getPage(@Param('handle') handle: string, @Res() res: ServerResponse): Promise<void> {
    const document = await this.pages.getPublicPageDocument(handle.toLowerCase());
    if (document === null) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(document));
  }
}
