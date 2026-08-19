import { createRouterTransport } from '@connectrpc/connect';
import { SystemService } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { createPatchesApi } from './api.js';

describe('createPatchesApi', () => {
  it('sends request-id/client/client-version metadata and a default deadline on every call', async () => {
    let seenHeaders: Headers | undefined;
    let seenTimeoutMs: number | undefined;

    const transport = createRouterTransport((router) => {
      router.service(SystemService, {
        ping(request, context) {
          seenHeaders = context.requestHeader;
          seenTimeoutMs = context.timeoutMs();
          return { nonce: request.nonce };
        },
      });
    });

    const api = createPatchesApi({ transport, clientName: 'test-client', clientVersion: '9.9.9' });
    const response = await api.system.ping({ nonce: 'hello' });

    expect(response.nonce).toBe('hello');
    expect(seenHeaders?.get('x-patches-client')).toBe('test-client');
    expect(seenHeaders?.get('x-patches-client-version')).toBe('9.9.9');
    expect(seenHeaders?.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // Default unary deadline (10s) applied — `timeoutMs()` returns the remaining time,
    // so it must be a positive number close to, but not over, the default.
    expect(seenTimeoutMs).toBeGreaterThan(0);
    expect(seenTimeoutMs).toBeLessThanOrEqual(10_000);
  });

  it('gives every call a fresh request ID', async () => {
    const seen: string[] = [];
    const transport = createRouterTransport((router) => {
      router.service(SystemService, {
        ping(request, context) {
          seen.push(context.requestHeader.get('x-request-id') ?? '');
          return { nonce: request.nonce };
        },
      });
    });
    const api = createPatchesApi({ transport, clientName: 'test-client', clientVersion: '1.0.0' });

    await api.system.ping({ nonce: 'a' });
    await api.system.ping({ nonce: 'b' });

    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('lets a caller override the default deadline via CallOptions', async () => {
    let seenTimeoutMs: number | undefined;
    const transport = createRouterTransport((router) => {
      router.service(SystemService, {
        ping(request, context) {
          seenTimeoutMs = context.timeoutMs();
          return { nonce: request.nonce };
        },
      });
    });
    const api = createPatchesApi({ transport, clientName: 'test-client', clientVersion: '1.0.0' });

    await api.system.ping({ nonce: 'a' }, { timeoutMs: 250 });

    expect(seenTimeoutMs).toBeGreaterThan(0);
    expect(seenTimeoutMs).toBeLessThanOrEqual(250);
  });

  it('preserves caller-supplied headers alongside the client identity headers', async () => {
    let seenHeaders: Headers | undefined;
    const transport = createRouterTransport((router) => {
      router.service(SystemService, {
        ping(request, context) {
          seenHeaders = context.requestHeader;
          return { nonce: request.nonce };
        },
      });
    });
    const api = createPatchesApi({ transport, clientName: 'test-client', clientVersion: '1.0.0' });

    await api.system.ping({ nonce: 'a' }, { headers: { authorization: 'Bearer token-123' } });

    expect(seenHeaders?.get('authorization')).toBe('Bearer token-123');
    expect(seenHeaders?.get('x-patches-client')).toBe('test-client');
  });
});
