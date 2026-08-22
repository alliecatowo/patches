import type { ServerResponse } from 'node:http';

import { describe, expect, it, vi } from 'vitest';

import type { FederationMetricsService } from '../federation-metrics.service.js';
import type { PeerRateLimiterService } from '../security/peer-rate-limiter.service.js';
import type { InboxService } from '../services/inbox.service.js';
import { InboxController } from './inbox.controller.js';
import type { RequestWithRawBody } from './raw-body.middleware.js';

function request(peer: string, rawBody: string): RequestWithRawBody {
  return {
    headers: {},
    method: 'POST',
    url: '/inbox',
    rawBody: Buffer.from(rawBody),
    socket: { remoteAddress: peer },
  } as unknown as RequestWithRawBody;
}

function response(): { raw: ServerResponse; end: ReturnType<typeof vi.fn> } {
  const end = vi.fn();
  return { raw: { statusCode: 0, end } as unknown as ServerResponse, end };
}

describe('InboxController abuse budget', () => {
  it('charges the transport peer before parsing attacker-controlled actor JSON', async () => {
    const handle = vi.fn();
    const consumeTransportPeer = vi.fn().mockReturnValue(false);
    const increment = vi.fn();
    const inbox = { handle } as unknown as InboxService;
    const rateLimiter = { consumeTransportPeer } as unknown as PeerRateLimiterService;
    const metrics = { increment } as unknown as FederationMetricsService;
    const controller = new InboxController(inbox, rateLimiter, metrics);
    const res = response();

    await controller.shared(request('203.0.113.8', '{not-json'), res.raw);

    expect(consumeTransportPeer).toHaveBeenCalledWith('203.0.113.8');
    expect(handle).not.toHaveBeenCalled();
    expect(increment).toHaveBeenCalledWith('inbox_rejected_ratelimit');
    expect(res.raw.statusCode).toBe(429);
  });

  it('cannot evade the transport budget by rotating spoofed actor hosts', async () => {
    const handle = vi.fn().mockResolvedValue({ accepted: false, reason: 'MALFORMED_ACTIVITY' });
    const inbox = { handle } as unknown as InboxService;
    const consumeTransportPeer = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const rateLimiter = { consumeTransportPeer } as unknown as PeerRateLimiterService;
    const metrics = { increment: vi.fn() } as unknown as FederationMetricsService;
    const controller = new InboxController(inbox, rateLimiter, metrics);

    await controller.shared(
      request('203.0.113.8', '{"actor":"https://one.invalid/users/a"}'),
      response().raw,
    );
    const second = response();
    await controller.shared(
      request('203.0.113.8', '{"actor":"https://two.invalid/users/a"}'),
      second.raw,
    );

    expect(consumeTransportPeer).toHaveBeenNthCalledWith(1, '203.0.113.8');
    expect(consumeTransportPeer).toHaveBeenNthCalledWith(2, '203.0.113.8');
    expect(handle).toHaveBeenCalledTimes(1);
    expect(second.raw.statusCode).toBe(429);
  });
});
