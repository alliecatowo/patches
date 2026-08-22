import type { ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { configureProxyTrust } from '../../../transport/connect/connect.middleware.js';
import { FederationMetricsService } from '../federation-metrics.service.js';
import { PeerRateLimiterService } from '../security/peer-rate-limiter.service.js';
import { InboxService } from '../services/inbox.service.js';
import { InboxController } from './inbox.controller.js';
import type { RequestWithRawBody } from './raw-body.middleware.js';

function request(peer: string, rawBody: string, proxyDerivedPeer?: string): RequestWithRawBody {
  return {
    headers: {},
    method: 'POST',
    url: '/inbox',
    rawBody: Buffer.from(rawBody),
    ...(proxyDerivedPeer === undefined ? {} : { ip: proxyDerivedPeer }),
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

  it('uses the Express proxy-derived peer when trusted proxy handling supplied one', async () => {
    const handle = vi.fn();
    const consumeTransportPeer = vi.fn().mockReturnValue(false);
    const controller = new InboxController(
      { handle } as unknown as InboxService,
      { consumeTransportPeer } as unknown as PeerRateLimiterService,
      { increment: vi.fn() } as unknown as FederationMetricsService,
    );

    await controller.shared(request('172.16.0.8', '{}', '203.0.113.8'), response().raw);

    expect(consumeTransportPeer).toHaveBeenCalledWith('203.0.113.8');
    expect(handle).not.toHaveBeenCalled();
  });

  it('cannot bypass the transport budget by rotating the spoofable left-most XFF over HTTP', async () => {
    const handle = vi.fn().mockResolvedValue({ accepted: false, reason: 'MALFORMED_ACTIVITY' });
    const increment = vi.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [InboxController],
      providers: [
        PeerRateLimiterService,
        { provide: InboxService, useValue: { handle } },
        { provide: FederationMetricsService, useValue: { increment } },
      ],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureProxyTrust(app, true);
    await app.listen(0, '127.0.0.1');

    try {
      const address = app.getHttpServer().address() as AddressInfo;
      const url = `http://127.0.0.1:${String(address.port)}/inbox`;
      for (let requestNumber = 0; requestNumber < 120; requestNumber += 1) {
        const result = await fetch(url, {
          method: 'POST',
          headers: {
            'x-forwarded-for': `198.51.100.${String(requestNumber + 1)}, 203.0.113.8`,
          },
        });
        expect(result.status).toBe(400);
      }

      const blocked = await fetch(url, {
        method: 'POST',
        headers: { 'x-forwarded-for': '192.0.2.250, 203.0.113.8' },
      });

      expect(blocked.status).toBe(429);
      expect(handle).toHaveBeenCalledTimes(120);
      expect(increment).toHaveBeenCalledWith('inbox_rejected_ratelimit');
    } finally {
      await app.close();
    }
  });
});
