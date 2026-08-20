import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { lastValueFrom, NEVER, of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { type AppConfigService } from '../../config/app-config.service.js';
import { type AccessTokenClaims } from '../../modules/auth/token.service.js';
import { setSessionClaims } from '../../modules/auth/session-context.js';
import { runWithRequestContext } from '../context/request-context.js';
import { RpcBudgetInterceptor } from './rpc-budget.interceptor.js';

function fakeConfig(overrides: Partial<Record<string, number>> = {}): AppConfigService {
  return {
    rpcReadBudgetPerPeerPerMin: 100,
    rpcReadBudgetPerActorPerMin: 100,
    rpcWriteBudgetPerPeerPerMin: 100,
    rpcWriteBudgetPerActorPerMin: 100,
    rpcSearchBudgetPerPeerPerMin: 100,
    rpcSearchBudgetPerActorPerMin: 100,
    rpcWriteConcurrencyLimit: 100,
    rpcTimeoutMs: 5_000,
    ...overrides,
  } as unknown as AppConfigService;
}

function rpcContext(call: object = {}): ExecutionContext {
  return {
    getType: () => 'rpc',
    switchToRpc: () => ({ getContext: () => call }),
    getClass: () => ({ name: 'TestController' }),
    getHandler: () => ({ name: 'testHandler' }),
  } as unknown as ExecutionContext;
}

function handlerThatEmits(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

function handlerThatNeverCompletes(): CallHandler {
  return { handle: () => NEVER };
}

async function withContext<T>(rpc: string, peer: string, fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(
    { requestId: 'req-1', client: undefined, clientVersion: undefined, rpc, peer },
    fn,
  );
}

const CLAIMS = (actorId: string): AccessTokenClaims => ({
  userId: 'user-1',
  actorId,
  sessionId: 'session-1',
  expiresAt: new Date(Date.now() + 60_000),
});

describe('RpcBudgetInterceptor (S-001/S-002)', () => {
  it('passes non-rpc contexts straight through untouched', async () => {
    const interceptor = new RpcBudgetInterceptor(fakeConfig());
    const httpContext = { getType: () => 'http' } as unknown as ExecutionContext;

    await expect(
      lastValueFrom(interceptor.intercept(httpContext, handlerThatEmits('ok'))),
    ).resolves.toBe('ok');
  });

  it('allows calls under the peer read budget and rejects the one over it', async () => {
    const interceptor = new RpcBudgetInterceptor(fakeConfig({ rpcReadBudgetPerPeerPerMin: 1 }));
    const context = rpcContext();
    const call = () =>
      withContext('patches.v1.PostService/GetPost', 'peer-1', () =>
        lastValueFrom(interceptor.intercept(context, handlerThatEmits('ok'))),
      );

    await expect(call()).resolves.toBe('ok');
    await expect(call()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('keys the actor budget independently of which peer the caller is on', async () => {
    const interceptor = new RpcBudgetInterceptor(
      fakeConfig({ rpcReadBudgetPerActorPerMin: 1, rpcReadBudgetPerPeerPerMin: 100 }),
    );
    const call: Record<string, unknown> = {};
    setSessionClaims(call as never, CLAIMS('actor-1'));
    const context = rpcContext(call);

    const first = await withContext('patches.v1.PostService/GetPost', 'peer-1', () =>
      lastValueFrom(interceptor.intercept(context, handlerThatEmits('ok'))),
    );
    expect(first).toBe('ok');

    // Different peer, same authenticated actor — the shared actor budget is what rejects this,
    // not the (still fresh) peer budget.
    await expect(
      withContext('patches.v1.PostService/GetPost', 'peer-2', () =>
        lastValueFrom(interceptor.intercept(context, handlerThatEmits('ok'))),
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('sheds a write RPC immediately once the write-concurrency gate is full', async () => {
    const interceptor = new RpcBudgetInterceptor(fakeConfig({ rpcWriteConcurrencyLimit: 1 }));
    const context = rpcContext();

    await withContext('patches.v1.PostService/CreatePost', 'peer-1', async () => {
      // Never subscribed — simulates one write RPC still in flight, holding the one slot.
      interceptor.intercept(context, handlerThatNeverCompletes());

      expect(() => interceptor.intercept(context, handlerThatEmits('ok'))).toThrow(
        expect.objectContaining({ code: 'NODE_OVERLOADED' }),
      );
    });
  });

  it('never gates a read RPC on write concurrency', async () => {
    const interceptor = new RpcBudgetInterceptor(fakeConfig({ rpcWriteConcurrencyLimit: 1 }));
    const context = rpcContext();

    await withContext('patches.v1.PostService/CreatePost', 'peer-1', async () => {
      interceptor.intercept(context, handlerThatNeverCompletes()); // holds the one write slot
    });

    await expect(
      withContext('patches.v1.PostService/GetPost', 'peer-1', () =>
        lastValueFrom(interceptor.intercept(context, handlerThatEmits('ok'))),
      ),
    ).resolves.toBe('ok');
  });

  it('abandons a handler that runs past the configured deadline', async () => {
    const interceptor = new RpcBudgetInterceptor(fakeConfig({ rpcTimeoutMs: 20 }));
    const context = rpcContext();

    await expect(
      withContext('patches.v1.PostService/GetPost', 'peer-1', () =>
        lastValueFrom(interceptor.intercept(context, handlerThatNeverCompletes())),
      ),
    ).rejects.toMatchObject({ code: 'RPC_TIMEOUT' });
  });
});
