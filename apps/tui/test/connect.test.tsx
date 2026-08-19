import { status as GrpcStatus } from '@grpc/grpc-js';
import { describe, expect, it, vi } from 'vitest';

import { expectFrame, flush, renderApp } from './harness.js';

describe('shell startup (B-015; owner feedback 2026-08-18)', () => {
  it('opens straight onto the local timeline while signed out, connection state in the status bar', async () => {
    const { lastFrame, unmount } = renderApp();

    // No connect splash in the way of the content any more — the timeline is up
    // immediately and the connection resolves into the status bar behind it.
    const frame = await expectFrame(lastFrame, 'connected');
    expect(frame).toContain('Local');
    expect(frame).toContain('Reading as a guest — press L to log in');
    expect(frame).toContain('patches.test:50051');
    // Not signed in yet — the status bar shows no `@handle`.
    expect(frame).not.toContain('· @');
    unmount();
  });

  it('reports an unreachable node in the status bar and recovers when Ctrl+R is pressed', async () => {
    const getServerInfoImpl = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('down'), { code: GrpcStatus.UNAVAILABLE }))
      .mockResolvedValueOnce({
        serverVersion: '0.1.0',
        protocolVersion: 1,
        minClientVersion: '0.1.0',
        serverTime: undefined,
        instanceName: 'patches-test',
        features: [],
      });
    const { press, lastFrame, unmount } = renderApp({ fakeOptions: { getServerInfoImpl } });

    await expectFrame(lastFrame, 'offline');
    await flush();

    press('\u0012');

    await expectFrame(lastFrame, 'connected');
    unmount();
  });

  it('shows the full server identity on the help screen (where the connect splash went)', async () => {
    const { press, lastFrame, unmount } = renderApp();
    await expectFrame(lastFrame, 'Local');
    await flush();

    press('?');

    const frame = await expectFrame(lastFrame, 'patches-test');
    expect(frame).toContain('protocol v1');
    unmount();
  });
});
