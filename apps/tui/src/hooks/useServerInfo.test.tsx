import type { GetServerInfoResponse } from '@patches/proto';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { useServerInfo } from './useServerInfo.js';

function Harness({ api }: { api: PatchesApi }): ReactElement {
  const { state, retryAt } = useServerInfo(api);
  return <Text>{`status:${state.status} retryAt:${retryAt === undefined ? 'none' : 'set'}`}</Text>;
}

function fakeInfo(): GetServerInfoResponse {
  return {
    domain: 'patches.test',
    softwareVersion: '0.0.0',
    registrationMode: 0,
    limits: {
      postBodyMaxChars: 500,
      bioMaxChars: 160,
      displayNameMaxChars: 64,
      handleMaxChars: 24,
      locationTextMaxChars: 64,
      websiteUrlMaxChars: 256,
      altTextMaxChars: 1000,
      searchQueryMaxChars: 256,
    },
    capabilities: [],
  } as unknown as GetServerInfoResponse;
}

describe('useServerInfo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('goes ready with no retry scheduled on success', async () => {
    const getServerInfo = vi.fn().mockResolvedValue(fakeInfo());
    const api = { target: 'patches.test:50051', getServerInfo } as unknown as PatchesApi;

    const { lastFrame } = render(<Harness api={api} />);
    await vi.waitFor(() => expect(lastFrame()).toContain('status:ready'));
    expect(lastFrame()).toContain('retryAt:none');
  });

  it('schedules an auto-retry with retryAt set for a retryable failure', async () => {
    const getServerInfo = vi.fn().mockRejectedValue({ code: 14 }); // UNAVAILABLE — retryable
    const api = { target: 'patches.test:50051', getServerInfo } as unknown as PatchesApi;

    const { lastFrame } = render(<Harness api={api} />);
    await vi.waitFor(() => expect(lastFrame()).toContain('status:error'));
    expect(lastFrame()).toContain('retryAt:set');
  });

  it('auto-retries on the backoff schedule and clears retryAt once ready', async () => {
    const getServerInfo = vi
      .fn()
      .mockRejectedValueOnce({ code: 14 })
      .mockResolvedValueOnce(fakeInfo());
    const api = { target: 'patches.test:50051', getServerInfo } as unknown as PatchesApi;

    const { lastFrame } = render(<Harness api={api} />);
    await vi.waitFor(() => expect(lastFrame()).toContain('status:error'));
    expect(getServerInfo).toHaveBeenCalledTimes(1);

    // First step of the backoff schedule is 2s.
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(getServerInfo).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(lastFrame()).toContain('status:ready'));
    expect(lastFrame()).toContain('retryAt:none');
  });

  it('does not schedule a retry for a non-retryable error', async () => {
    const getServerInfo = vi.fn().mockRejectedValue({ code: 5 }); // NOT_FOUND — not retryable
    const api = { target: 'patches.test:50051', getServerInfo } as unknown as PatchesApi;

    const { lastFrame } = render(<Harness api={api} />);
    await vi.waitFor(() => expect(lastFrame()).toContain('status:error'));
    expect(lastFrame()).toContain('retryAt:none');
  });
});
