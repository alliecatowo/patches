import { status as GrpcStatus } from '@grpc/grpc-js';
import { dateToTimestamp, type GetServerInfoResponse } from '@patches/proto';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { App } from './App.js';

const SERVER_INFO: GetServerInfoResponse = {
  serverVersion: '0.1.0',
  protocolVersion: 1,
  minClientVersion: '0.1.0',
  serverTime: dateToTimestamp(new Date('2026-08-17T21:00:00.000Z')),
  instanceName: 'patches-test',
  features: ['system.ping'],
};

/** A stand-in for the network layer; the App only ever sees this interface. */
function fakeApi(getServerInfo: () => Promise<GetServerInfoResponse>): PatchesApi {
  return {
    target: 'patches.local:50051',
    getServerInfo: vi.fn(getServerInfo),
    ping: vi.fn(),
    close: vi.fn(),
  } as unknown as PatchesApi;
}

/** Let the pending promise settle and React flush the resulting state update. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('App', () => {
  it('shows a connecting state before the server answers', () => {
    const api = fakeApi(() => new Promise<GetServerInfoResponse>(() => undefined));
    const { lastFrame, unmount } = render(<App api={api} />);

    expect(lastFrame()).toContain('Connecting to patches.local:50051');
    expect(lastFrame()).toContain('connecting');
    unmount();
  });

  it('renders the server identity once connected', async () => {
    const api = fakeApi(() => Promise.resolve(SERVER_INFO));
    const { lastFrame, unmount } = render(<App api={api} />);

    await flush();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Connected to patches-test');
    expect(frame).toContain('0.1.0 (protocol v1)');
    expect(frame).toContain('system.ping');
    expect(frame).toContain('connected');
    unmount();
  });

  it('renders an unreachable server as a human message, not a stack trace', async () => {
    const api = fakeApi(() =>
      Promise.reject(Object.assign(new Error('14 UNAVAILABLE'), { code: GrpcStatus.UNAVAILABLE })),
    );
    const { lastFrame, unmount } = render(<App api={api} />);

    await flush();

    const frame = lastFrame() ?? '';
    expect(frame).toContain("Can't reach the Patches server at patches.local:50051");
    expect(frame).toContain('offline');
    expect(frame).not.toContain('    at ');
    expect(frame).not.toContain('Error:');
    unmount();
  });

  it('retries the call when R is pressed', async () => {
    const getServerInfo = vi
      .fn<() => Promise<GetServerInfoResponse>>()
      .mockRejectedValueOnce(Object.assign(new Error('down'), { code: GrpcStatus.UNAVAILABLE }))
      .mockResolvedValueOnce(SERVER_INFO);
    const api = fakeApi(getServerInfo);

    const { lastFrame, stdin, unmount } = render(<App api={api} />);
    await flush();
    expect(lastFrame()).toContain('offline');

    stdin.write('R');
    await flush();

    expect(lastFrame()).toContain('Connected to patches-test');
    expect(getServerInfo).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('toggles the help screen with ?', async () => {
    const api = fakeApi(() => Promise.resolve(SERVER_INFO));
    const { lastFrame, stdin, unmount } = render(<App api={api} />);
    await flush();

    stdin.write('?');
    await flush();
    expect(lastFrame()).toContain('reconnect to the server');

    stdin.write('?');
    await flush();
    expect(lastFrame()).toContain('Connected to patches-test');
    unmount();
  });
});
