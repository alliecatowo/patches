import type { IncomingMessage, ServerResponse } from 'node:http';

import { Controller, Post, Req, Res } from '@nestjs/common';

import { WEB_VITALS_MAX_BODY_BYTES } from './web-vitals.constants.js';
import { BodyTooLargeError, readBoundedBody } from './web-vitals-body-reader.js';
import { WebVitalsRateLimiterService } from './web-vitals-rate-limiter.service.js';
import { WebVitalsService } from './web-vitals.service.js';

interface RequestWithPeer extends IncomingMessage {
  ip?: string;
}

/**
 * `POST /ingest/web-vitals` (B-182) — a plain Nest HTTP route, not a Connect/gRPC RPC.
 * `apps/web/src/lib/webVitals.ts` sends via `navigator.sendBeacon` first, falling back to a
 * `keepalive` `fetch`; `sendBeacon` cannot set arbitrary headers or speak Connect's request
 * framing, and the client already serializes plain JSON, so a plain JSON POST route is the
 * only shape that call site can actually reach — the same reasoning that put the federation
 * inbox/webfinger/actor/outbox surface on plain Nest HTTP controllers instead of gRPC
 * (`modules/federation/http/inbox.controller.ts`).
 *
 * Unauthenticated and internet-facing (every browser tab that loads the web client can post
 * here), so every step below treats the request as hostile: a process-local rate limit keyed
 * by transport peer (before any body is read), a hard byte cap on the body itself, and full
 * schema validation (`WebVitalsService`, `@patches/domain`) before anything is folded into a
 * metric. No response body is ever needed — `sendBeacon` never reads one — so every branch
 * below just sets a status code and ends the response.
 */
@Controller()
export class WebVitalsController {
  constructor(
    private readonly rateLimiter: WebVitalsRateLimiterService,
    private readonly service: WebVitalsService,
  ) {}

  @Post('ingest/web-vitals')
  async ingest(@Req() req: RequestWithPeer, @Res() res: ServerResponse): Promise<void> {
    // Express derives `ip` from the socket unless `TRUST_PROXY_HEADERS` is set (`main.ts`) —
    // same trust-boundary reasoning as `InboxController`'s transport-peer budget.
    const peer = req.ip ?? req.socket.remoteAddress ?? '<unknown-peer>';
    if (!this.rateLimiter.consume(peer)) {
      res.statusCode = 429;
      res.end();
      return;
    }

    let body: Buffer;
    try {
      body = await readBoundedBody(req, WEB_VITALS_MAX_BODY_BYTES);
    } catch (error) {
      res.statusCode = error instanceof BodyTooLargeError ? 413 : 400;
      res.end();
      return;
    }

    const outcome = this.service.ingestRawBody(body.toString('utf8'));
    res.statusCode = outcome.accepted ? 202 : 400;
    res.end();
  }
}
