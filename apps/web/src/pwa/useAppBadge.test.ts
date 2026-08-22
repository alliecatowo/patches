import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppBadge } from './useAppBadge.js';

describe('useAppBadge', () => {
  const mockSetAppBadge = vi.fn().mockResolvedValue(undefined);
  const mockClearAppBadge = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    Object.assign(navigator, {
      setAppBadge: mockSetAppBadge,
      clearAppBadge: mockClearAppBadge,
    });
  });

  afterEach(() => {
    mockSetAppBadge.mockReset();
    mockClearAppBadge.mockReset();
  });

  it('sets app badge when count is greater than 0', () => {
    renderHook(() => useAppBadge(5));
    expect(mockSetAppBadge).toHaveBeenCalledWith(5);
    expect(mockClearAppBadge).not.toHaveBeenCalled();
  });

  it('clears app badge when count is 0 or undefined', () => {
    const { rerender } = renderHook(
      ({ count }: { count: number | undefined }) => useAppBadge(count),
      {
        initialProps: { count: 3 },
      },
    );

    expect(mockSetAppBadge).toHaveBeenCalledWith(3);

    rerender({ count: 0 });
    expect(mockClearAppBadge).toHaveBeenCalled();
  });
});
