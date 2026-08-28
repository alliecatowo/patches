import type { PatchesApi } from '@patches/client';
import { FeatureFlagKind } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mockGetNodeInfo = vi.fn().mockResolvedValue({
  featureFlags: [
    { name: 'web_new_theme', enabled: true, kind: FeatureFlagKind.COSMETIC },
    { name: 'web_new_compose_route', enabled: false, kind: FeatureFlagKind.ROLLOUT },
  ],
});

vi.mock('../api/client.js', () => ({
  api: { node: { getNodeInfo: mockGetNodeInfo } } as unknown as PatchesApi,
}));

const { useFeatureFlag, useFeatureFlags } = await import('./useFeatureFlags.js');

function wrapper({ children }: { children: ReactNode }): ReactNode {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useFeatureFlag', () => {
  it('reads an enabled flag as true', async () => {
    const { result } = renderHook(() => useFeatureFlag('web_new_theme'), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('reads a disabled flag as false', async () => {
    const { result } = renderHook(() => useFeatureFlag('web_new_compose_route'), { wrapper });
    await waitFor(() => expect(mockGetNodeInfo).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('reads an undeclared flag name as false, never throws', async () => {
    const { result } = renderHook(() => useFeatureFlag('does_not_exist'), { wrapper });
    await waitFor(() => expect(mockGetNodeInfo).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});

describe('useFeatureFlags', () => {
  it('returns the full resolved list', async () => {
    const { result } = renderHook(() => useFeatureFlags(), { wrapper });
    await waitFor(() => expect(result.current).toHaveLength(2));
  });
});
