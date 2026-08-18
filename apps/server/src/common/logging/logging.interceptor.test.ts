import { type CallHandler, type ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runWithRequestContext } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';
import { LoggingInterceptor } from './logging.interceptor.js';

const STUB_CONTEXT = {} as ExecutionContext;

function handlerThatEmits(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

function handlerThatFails(error: unknown): CallHandler {
  return { handle: () => throwError(() => error) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LoggingInterceptor (spec §98)', () => {
  it('logs rpc.ok with outcome "ok" on a successful response', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const interceptor = new LoggingInterceptor();

    await lastValueFrom(interceptor.intercept(STUB_CONTEXT, handlerThatEmits({ ok: true })));

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0] as [Record<string, unknown>];
    expect(line.msg).toBe('rpc.ok');
    expect(line.outcome).toBe('ok');
    expect(typeof line.durationMs).toBe('number');
  });

  it('logs rpc.failed with the AppError code as the outcome', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const interceptor = new LoggingInterceptor();
    const error = AppError.validation('bad input');

    await expect(
      lastValueFrom(interceptor.intercept(STUB_CONTEXT, handlerThatFails(error))),
    ).rejects.toBe(error);

    const [line] = logSpy.mock.calls[0] as [Record<string, unknown>];
    expect(line.msg).toBe('rpc.failed');
    expect(line.outcome).toBe('VALIDATION_ERROR');
  });

  it('logs rpc.failed with outcome "unhandled" for a non-AppError failure', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const interceptor = new LoggingInterceptor();

    await expect(
      lastValueFrom(interceptor.intercept(STUB_CONTEXT, handlerThatFails(new Error('boom')))),
    ).rejects.toThrow('boom');

    const [line] = logSpy.mock.calls[0] as [Record<string, unknown>];
    expect(line.outcome).toBe('unhandled');
  });

  it('includes the ambient request context (rpc, requestId, client) in the log line', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const interceptor = new LoggingInterceptor();

    await runWithRequestContext(
      { requestId: 'req-77', client: 'tui', clientVersion: '1.2.3', rpc: 'Svc/Method' },
      () => lastValueFrom(interceptor.intercept(STUB_CONTEXT, handlerThatEmits({}))),
    );

    const [line] = logSpy.mock.calls[0] as [Record<string, unknown>];
    expect(line.rpc).toBe('Svc/Method');
    expect(line.requestId).toBe('req-77');
    expect(line.client).toBe('tui');
    expect(line.clientVersion).toBe('1.2.3');
  });

  it('never reads the authorization metadata key (a bearer token must not reach the logs)', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const interceptor = new LoggingInterceptor();
    // A context whose methods would throw if the interceptor ever touched them.
    const poisonedContext = {
      switchToRpc: () => {
        throw new Error('LoggingInterceptor must never read call metadata directly');
      },
    } as unknown as ExecutionContext;

    await lastValueFrom(interceptor.intercept(poisonedContext, handlerThatEmits({})));

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(line)).not.toContain('authorization');
  });
});
