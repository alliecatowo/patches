import { Code, ConnectError } from '@connectrpc/connect';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  resetDiagnosticsReporterForTests,
  getDiagnosticsReporter,
} from '../diagnostics/reporter.js';
import { withRpcFailureTelemetry } from './client.js';

describe('withRpcFailureTelemetry', () => {
  beforeEach(() => {
    resetDiagnosticsReporterForTests();
  });

  it('passes results through untouched', async () => {
    const methods = {
      getServerInfo: (): Promise<{ info: boolean }> => Promise.resolve({ info: true }),
    };
    const wrapped = withRpcFailureTelemetry(methods, () => undefined);
    await expect(wrapped.getServerInfo()).resolves.toEqual({ info: true });
    expect(getDiagnosticsReporter().snapshot().input.events).toHaveLength(0);
  });

  it('records status-code grade events on rejection and rethrows', async () => {
    const reporter = getDiagnosticsReporter();
    const failure = new ConnectError('server text that must not be recorded', Code.Unavailable);
    const methods = {
      listHomeFeed: (): Promise<unknown> => Promise.reject(failure),
    };
    const wrapped = withRpcFailureTelemetry(methods, (rpc, error) =>
      reporter.recordRpcFailure(
        rpc,
        error instanceof ConnectError ? error.code : -1,
        'UNAVAILABLE',
      ),
    );
    await expect(wrapped.listHomeFeed()).rejects.toBe(failure);
    const events = reporter.snapshot().input.events ?? [];
    expect(events).toHaveLength(1);
    // RPC name + code only — the message body never enters the diagnostics ring.
    expect(events[0]?.message).toBe('rpc listHomeFeed failed: UNAVAILABLE(14)');
  });

  it('wraps every function-valued entry and leaves the rest alone', () => {
    const sentinel = { keepMe: true };
    const methods = {
      ping: (): Promise<string> => Promise.resolve('pong'),
      close: (): void => undefined,
      meta: sentinel,
    };
    const wrapped = withRpcFailureTelemetry(methods, () => undefined);
    expect(wrapped['meta']).toBe(sentinel);
    expect(typeof wrapped['ping']).toBe('function');
    expect(typeof wrapped['close']).toBe('function');
  });
});
