import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseSessionExpiry = vi.fn<() => number | undefined>();
const mockListCredentials = vi.fn<() => Promise<{ credentials: never[] }>>();

vi.mock('./useSession.js', () => ({
  useSessionExpiry: () => mockUseSessionExpiry(),
}));

vi.mock('../api/client.js', () => ({
  api: { auth: { listCredentials: () => mockListCredentials() } },
}));

const { useSessionKeepAlive } = await import('./useSessionKeepAlive.js');

describe('useSessionKeepAlive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseSessionExpiry.mockReset();
    mockListCredentials.mockReset().mockResolvedValue({ credentials: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing while signed out (no expiry)', () => {
    mockUseSessionExpiry.mockReturnValue(undefined);
    renderHook(() => useSessionKeepAlive());
    vi.runAllTimers();
    expect(mockListCredentials).not.toHaveBeenCalled();
  });

  it('fires a lightweight authenticated call exactly at the access token expiry', () => {
    mockUseSessionExpiry.mockReturnValue(Date.now() + 60_000);
    renderHook(() => useSessionKeepAlive());

    vi.advanceTimersByTime(59_999);
    expect(mockListCredentials).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockListCredentials).toHaveBeenCalledTimes(1);
  });

  it('reschedules when the expiry changes (e.g. a refresh landed)', () => {
    mockUseSessionExpiry.mockReturnValue(Date.now() + 10_000);
    const { rerender } = renderHook(() => useSessionKeepAlive());

    mockUseSessionExpiry.mockReturnValue(Date.now() + 60_000);
    rerender();

    vi.advanceTimersByTime(10_000);
    expect(mockListCredentials).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50_000);
    expect(mockListCredentials).toHaveBeenCalledTimes(1);
  });
});
