import type { ServerResponse } from 'node:http';

import { Controller, Post, Req, Res } from '@nestjs/common';

import { PeerRateLimiterService } from '../security/peer-rate-limiter.service.js';
import { InboxService, type InboxRejectionReason } from '../services/inbox.service.js';
import type { RequestWithRawBody } from './raw-body.middleware.js';

const STATUS_BY_REJECTION: Readonly<Record<InboxRejectionReason, number>> = {
  INVALID_SIGNATURE: 401,
  DOMAIN_BLOCKED: 403,
  ACTOR_MISMATCH: 400,
  MALFORMED_ACTIVITY: 400,
};

/** `POST /users/:handle/inbox` and the shared `POST /inbox` (P8-002). Both funnel into the
 * same `InboxService.handle` — a per-actor inbox and the shared inbox are the same processing
 * pipeline, just a different addressing convenience for the sender (P8-004's "shared inbox
 * dedupe" is about outbound delivery choosing one over the other, not inbound handling
 * differing). */
@Controller()
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly rateLimiter: PeerRateLimiterService,
  ) {}

  @Post('users/:handle/inbox')
  async perActor(@Req() req: RequestWithRawBody, @Res() res: ServerResponse): Promise<void> {
    await this.process(req, res);
  }

  @Post('inbox')
  async shared(@Req() req: RequestWithRawBody, @Res() res: ServerResponse): Promise<void> {
    await this.process(req, res);
  }

  private async process(req: RequestWithRawBody, res: ServerResponse): Promise<void> {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    let peerHost: string | undefined;
    try {
      const parsed = JSON.parse(rawBody.toString('utf8')) as { actor?: unknown };
      if (typeof parsed.actor === 'string') peerHost = new URL(parsed.actor).host;
    } catch {
      // Falls through to InboxService.handle, which rejects the same malformed body with a
      // proper `MALFORMED_ACTIVITY` response — rate limiting an unparseable body is skipped
      // rather than guessed at.
    }
    if (peerHost !== undefined && !this.rateLimiter.consume(peerHost)) {
      res.statusCode = 429;
      res.end('Too many requests.');
      return;
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key] = value;
      else if (Array.isArray(value) && value[0] !== undefined) headers[key] = value[0];
    }

    const result = await this.inbox.handle({
      method: req.method ?? 'POST',
      target: req.url ?? '/inbox',
      headers,
      rawBody,
    });

    if (result.accepted) {
      res.statusCode = 202;
      res.end();
      return;
    }
    res.statusCode = STATUS_BY_REJECTION[result.reason];
    res.end();
  }
}
