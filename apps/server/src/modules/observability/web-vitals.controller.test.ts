import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';

import { describe, expect, it, vi } from 'vitest';

import { WebVitalsController } from './web-vitals.controller.js';
import type { WebVitalsRateLimiterService } from './web-vitals-rate-limiter.service.js';
import type { WebVitalsIngestOutcome, WebVitalsService } from './web-vitals.service.js';

type FakeRequest = NodeJS.EventEmitter & {
  ip?: string;
  socket: { remoteAddress?: string };
  destroy: () => void;
};

function fakeRequest(peer: string, chunks: readonly string[]): FakeRequest {
  const emitter = new EventEmitter() as FakeRequest;
  emitter.socket = { remoteAddress: peer };
  emitter.destroy = (): void => {
    // Real `IncomingMessage.destroy()` tears down the socket; a fake stream has nothing to
    // tear down beyond stopping delivery, which the caller already does by rejecting.
  };
  queueMicrotask(() => {
    for (const chunk of chunks) emitter.emit('data', Buffer.from(chunk));
    emitter.emit('end');
  });
  return emitter;
}

function fakeResponse(): { raw: ServerResponse; end: ReturnType<typeof vi.fn> } {
  const end = vi.fn();
  return { raw: { statusCode: 0, end } as unknown as ServerResponse, end };
}

describe('WebVitalsController', () => {
  it('accepts a well-formed payload with 202 and forwards it to the service', async () => {
    const ingestRawBody = vi.fn<(raw: string) => WebVitalsIngestOutcome>(() => ({
      accepted: true,
    }));
    const service = { ingestRawBody } as unknown as WebVitalsService;
    const consume = vi.fn().mockReturnValue(true);
    const rateLimiter = { consume } as unknown as WebVitalsRateLimiterService;
    const controller = new WebVitalsController(rateLimiter, service);
    const res = fakeResponse();
    const body = JSON.stringify({ route: '/p/:id', samples: [] });

    await controller.ingest(fakeRequest('203.0.113.9', [body]) as never, res.raw);

    expect(consume).toHaveBeenCalledWith('203.0.113.9');
    expect(ingestRawBody).toHaveBeenCalledWith(body);
    expect(res.raw.statusCode).toBe(202);
  });

  it('rejects with 429 before ever reading the body when the peer is rate-limited', async () => {
    const ingestRawBody = vi.fn();
    const service = { ingestRawBody } as unknown as WebVitalsService;
    const rateLimiter = {
      consume: vi.fn().mockReturnValue(false),
    } as unknown as WebVitalsRateLimiterService;
    const controller = new WebVitalsController(rateLimiter, service);
    const res = fakeResponse();

    await controller.ingest(fakeRequest('203.0.113.9', ['{}']) as never, res.raw);

    expect(res.raw.statusCode).toBe(429);
    expect(ingestRawBody).not.toHaveBeenCalled();
  });

  it('rejects an oversized body with 413 without ever reaching the service', async () => {
    const ingestRawBody = vi.fn();
    const service = { ingestRawBody } as unknown as WebVitalsService;
    const rateLimiter = {
      consume: vi.fn().mockReturnValue(true),
    } as unknown as WebVitalsRateLimiterService;
    const controller = new WebVitalsController(rateLimiter, service);
    const res = fakeResponse();
    const hostileChunk = 'x'.repeat(9 * 1024); // over the 8 KiB cap

    await controller.ingest(fakeRequest('203.0.113.9', [hostileChunk]) as never, res.raw);

    expect(res.raw.statusCode).toBe(413);
    expect(ingestRawBody).not.toHaveBeenCalled();
  });

  it('surfaces the service outcome as 400 when the payload is rejected', async () => {
    const ingestRawBody = vi.fn<(raw: string) => WebVitalsIngestOutcome>(() => ({
      accepted: false,
      reason: 'invalid_payload',
    }));
    const service = { ingestRawBody } as unknown as WebVitalsService;
    const rateLimiter = {
      consume: vi.fn().mockReturnValue(true),
    } as unknown as WebVitalsRateLimiterService;
    const controller = new WebVitalsController(rateLimiter, service);
    const res = fakeResponse();

    await controller.ingest(fakeRequest('203.0.113.9', ['{"route":"/hostile"}']) as never, res.raw);

    expect(res.raw.statusCode).toBe(400);
  });
});
