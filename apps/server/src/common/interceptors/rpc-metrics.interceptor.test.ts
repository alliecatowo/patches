import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { metricsRegistry, readRpcPollTotal } from '@patches/observability/metrics';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, beforeEach } from 'vitest';

import { runWithRequestContext } from '../context/request-context.js';
import { RpcMetricsInterceptor } from './rpc-metrics.interceptor.js';

function rpcContext(): ExecutionContext {
  return {
    getType: () => 'rpc',
    getArgByIndex: () => undefined,
    getClass: () => ({ name: 'TestController' }),
    getHandler: () => ({ name: 'testHandler' }),
  } as unknown as ExecutionContext;
}

function handlerThatEmits(): CallHandler {
  return { handle: () => of({}) };
}

async function withContext<T>(
  rpc: string,
  extra: { peer?: string; requestId?: string } = {},
  fn: () => Promise<T> | T,
): Promise<T> {
  return runWithRequestContext(
    {
      requestId: extra.requestId ?? 'req-1',
      client: undefined,
      clientVersion: undefined,
      rpc,
      peer: extra.peer,
    },
    async () => fn(),
  );
}

describe('RpcMetricsInterceptor DM-poll share (ADR 0032 T2, P19-020)', () => {
  const interceptor = new RpcMetricsInterceptor();

  beforeEach(() => {
    metricsRegistry.resetMetrics();
  });

  async function runAndGetCounts(): Promise<Record<string, number>> {
    const observed = await readRpcPollTotal.get();
    const counts: Record<string, number> = {};
    for (const sample of observed.values) {
      const key = String(sample.labels.is_dm_poll);
      counts[key] = (counts[key] ?? 0) + sample.value;
    }
    return counts;
  }

  it('counts ListMailboxEnvelopes as a DM poll', async () => {
    await withContext('patches.v1.E2eeService/ListMailboxEnvelopes', {}, async () => {
      await lastValueFrom(interceptor.intercept(rpcContext(), handlerThatEmits()));
    });
    expect(await runAndGetCounts()).toEqual({ true: 1 });
  });

  it('counts GetUnreadCount as a DM poll', async () => {
    await withContext('patches.v1.NotificationService/GetUnreadCount', {}, async () => {
      await lastValueFrom(interceptor.intercept(rpcContext(), handlerThatEmits()));
    });
    expect(await runAndGetCounts()).toEqual({ true: 1 });
  });

  it('counts an unrelated read RPC as non-DM-poll read volume', async () => {
    await withContext('patches.v1.PostService/GetPost', {}, async () => {
      await lastValueFrom(interceptor.intercept(rpcContext(), handlerThatEmits()));
    });
    expect(await runAndGetCounts()).toEqual({ false: 1 });
  });

  it('does not count a write RPC at all', async () => {
    await withContext('patches.v1.MessageService/SendMessage', {}, async () => {
      await lastValueFrom(interceptor.intercept(rpcContext(), handlerThatEmits()));
    });
    expect(await runAndGetCounts()).toEqual({});
  });

  it(
    'never lets an actor id, conversation id, device id, or peer address reach a label value, ' +
      'no matter what those fields contain — the counter has exactly one label ' +
      '(`is_dm_poll`), and its value is always the fixed string "true" or "false"',
    async () => {
      const adversarialInputs = [
        'patches.v1.E2eeService/ListMailboxEnvelopes',
        'patches.v1.NotificationService/GetUnreadCount',
        'patches.v1.PostService/GetPost',
      ];
      for (const rpc of adversarialInputs) {
        // Simulate a peer/request id that itself happens to look like a secret or identifier —
        // the metric must be structurally incapable of picking it up, since the interceptor
        // never reads `peer`/`requestId` when it increments this counter.
        await withContext(
          rpc,
          { peer: '203.0.113.7', requestId: 'actor-00000000-0000-4000-8000-00000000000a' },
          async () => {
            await lastValueFrom(interceptor.intercept(rpcContext(), handlerThatEmits()));
          },
        );
      }

      const observed = await readRpcPollTotal.get();
      expect(observed.name).toBe('patches_read_rpc_poll_total');
      for (const sample of observed.values) {
        const labelKeys = Object.keys(sample.labels);
        expect(labelKeys).toEqual(['is_dm_poll']);
        expect(['true', 'false']).toContain(String(sample.labels.is_dm_poll));
        // Every rejected/allowed identifier-looking string used above must never appear in a
        // label value.
        expect(String(sample.labels.is_dm_poll)).not.toContain('203.0.113.7');
        expect(String(sample.labels.is_dm_poll)).not.toContain('00000000-0000-4000-8000');
      }
    },
  );
});
