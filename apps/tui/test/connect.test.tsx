import { status as GrpcStatus } from '@grpc/grpc-js';
import { describe, expect, it, vi } from 'vitest';

import { expectFrame, renderApp } from './harness.js';

describe('connect screen (B-015)', () => {
  it('shows the server identity once GetServerInfo answers, then the status bar', async () => {
    const { lastFrame, unmount } = renderApp();

    const frame = await expectFrame(lastFrame, 'Connected to patches-test.');
    expect(frame).toContain('0.1.0 (protocol v1)');
    expect(frame).toContain('connected');
    // Not signed in yet — the status bar shows no `@handle`.
    expect(frame).not.toContain('· @');
    unmount();
  });

  it('shows an offline message and recovers when R is pressed (spec §81)', async () => {
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
    const { press, lastFrame, unmount } = renderApp({
      fakeOptions: { getServerInfoImpl },
    });

    const frame = await expectFrame(lastFrame, "Can't reach the Patches server");
    expect(frame).toContain('offline');

    press('R');

    await expectFrame(lastFrame, 'Connected to patches-test.');
    unmount();
  });
});
