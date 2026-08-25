import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAppBadgeStatus, reportAppBadgeOperation } from './appBadgeStatus.js';
import { useAppBadge } from './useAppBadge.js';

interface DeferredPromise {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferredPromise(): DeferredPromise {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

const originalSetAppBadge = Object.getOwnPropertyDescriptor(navigator, 'setAppBadge');
const originalClearAppBadge = Object.getOwnPropertyDescriptor(navigator, 'clearAppBadge');

function restoreNavigatorProperty(
  property: 'setAppBadge' | 'clearAppBadge',
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    // The test added this optional browser API, so deleting it restores jsdom's original shape.
    delete (navigator as Navigator & Record<typeof property, unknown>)[property];
  } else {
    Object.defineProperty(navigator, property, descriptor);
  }
}

describe('useAppBadge', () => {
  const mockSetAppBadge = vi.fn().mockResolvedValue(undefined);
  const mockClearAppBadge = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    mockSetAppBadge.mockReset().mockResolvedValue(undefined);
    mockClearAppBadge.mockReset().mockResolvedValue(undefined);
    reportAppBadgeOperation('idle');
    Object.defineProperties(navigator, {
      setAppBadge: { configurable: true, value: mockSetAppBadge },
      clearAppBadge: { configurable: true, value: mockClearAppBadge },
    });
  });

  afterEach(() => {
    restoreNavigatorProperty('setAppBadge', originalSetAppBadge);
    restoreNavigatorProperty('clearAppBadge', originalClearAppBadge);
    reportAppBadgeOperation('idle');
  });

  it('sets an app badge for unread notifications when supported', async () => {
    renderHook(() => useAppBadge(5, 'actor-a'));

    await waitFor(() => expect(mockSetAppBadge).toHaveBeenCalledWith(5));
    expect(mockClearAppBadge).not.toHaveBeenCalled();
  });

  it('clears the badge when unread notifications are read', async () => {
    const { rerender } = renderHook(
      ({ count }: { count: number | undefined }) => useAppBadge(count, 'actor-a'),
      {
        initialProps: { count: 3 },
      },
    );

    await waitFor(() => expect(mockSetAppBadge).toHaveBeenCalledWith(3));

    rerender({ count: 0 });
    await waitFor(() => expect(mockClearAppBadge).toHaveBeenCalledTimes(1));
  });

  it('clears before applying a badge for a different signed-in actor', async () => {
    const { rerender } = renderHook(
      ({ actorId, count }: { actorId: string | undefined; count: number }) =>
        useAppBadge(count, actorId),
      { initialProps: { actorId: 'actor-a', count: 3 } },
    );

    await waitFor(() => expect(mockSetAppBadge).toHaveBeenCalledWith(3));
    rerender({ actorId: 'actor-b', count: 7 });

    await waitFor(() => expect(mockSetAppBadge).toHaveBeenLastCalledWith(7));
    expect(mockClearAppBadge).toHaveBeenCalledTimes(1);
    expect(mockClearAppBadge.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetAppBadge.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('clears the badge when the actor signs out', async () => {
    const initialProps: { actorId: string | undefined } = { actorId: 'actor-a' };
    const { rerender } = renderHook(
      ({ actorId }: { actorId: string | undefined }) => useAppBadge(3, actorId),
      { initialProps },
    );

    await waitFor(() => expect(mockSetAppBadge).toHaveBeenCalledWith(3));
    rerender({ actorId: undefined });
    await waitFor(() => expect(mockClearAppBadge).toHaveBeenCalledTimes(1));
  });

  it('does nothing when the Badging API is unsupported', async () => {
    Object.defineProperties(navigator, {
      setAppBadge: { configurable: true, value: undefined },
      clearAppBadge: { configurable: true, value: undefined },
    });

    renderHook(() => useAppBadge(5, 'actor-a'));
    await Promise.resolve();

    expect(mockSetAppBadge).not.toHaveBeenCalled();
    expect(mockClearAppBadge).not.toHaveBeenCalled();
  });

  it('contains rejected badge calls so unread UI can remain functional', async () => {
    mockSetAppBadge.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    renderHook(() => useAppBadge(5, 'actor-a'));

    await waitFor(() => expect(mockSetAppBadge).toHaveBeenCalledWith(5));
    await waitFor(() => expect(getAppBadgeStatus().operation).toBe('failed'));
  });

  it('waits for a pending set before clearing and leaves the final state cleared', async () => {
    const pendingSet = deferredPromise();
    mockSetAppBadge.mockReturnValueOnce(pendingSet.promise);
    const { rerender } = renderHook(
      ({ count }: { count: number }) => useAppBadge(count, 'actor-a'),
      { initialProps: { count: 4 } },
    );

    await waitFor(() => expect(mockSetAppBadge).toHaveBeenCalledWith(4));
    rerender({ count: 0 });
    expect(mockClearAppBadge).not.toHaveBeenCalled();

    await act(() => {
      pendingSet.resolve();
      return pendingSet.promise;
    });
    await waitFor(() => expect(mockClearAppBadge).toHaveBeenCalledTimes(1));
    expect(getAppBadgeStatus().operation).toBe('cleared');
  });

  it('serializes a pending set through an account change before applying the new count', async () => {
    const pendingSet = deferredPromise();
    mockSetAppBadge.mockReturnValueOnce(pendingSet.promise);
    const { rerender } = renderHook(
      ({ actorId, count }: { actorId: string; count: number }) => useAppBadge(count, actorId),
      { initialProps: { actorId: 'actor-a', count: 4 } },
    );

    await waitFor(() => expect(mockSetAppBadge).toHaveBeenCalledWith(4));
    rerender({ actorId: 'actor-b', count: 2 });
    expect(mockClearAppBadge).not.toHaveBeenCalled();

    await act(() => {
      pendingSet.resolve();
      return pendingSet.promise;
    });
    await waitFor(() => expect(mockSetAppBadge).toHaveBeenLastCalledWith(2));
    expect(mockClearAppBadge).toHaveBeenCalledTimes(1);
    expect(mockClearAppBadge.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetAppBadge.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY,
    );
    expect(getAppBadgeStatus().operation).toBe('applied');
  });

  it('serializes rapid count transitions and leaves zero unread as the final state', async () => {
    const pendingSet = deferredPromise();
    mockSetAppBadge.mockReturnValueOnce(pendingSet.promise);
    const { rerender } = renderHook(
      ({ count }: { count: number }) => useAppBadge(count, 'actor-a'),
      { initialProps: { count: 1 } },
    );

    await waitFor(() => expect(mockSetAppBadge).toHaveBeenCalledWith(1));
    rerender({ count: 2 });
    rerender({ count: 0 });
    await act(() => {
      pendingSet.resolve();
      return pendingSet.promise;
    });

    await waitFor(() => expect(mockClearAppBadge).toHaveBeenCalledTimes(1));
    expect(mockSetAppBadge).toHaveBeenNthCalledWith(2, 2);
    expect(getAppBadgeStatus().operation).toBe('cleared');
  });
});
