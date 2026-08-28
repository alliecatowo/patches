import type { FeatureFlagKind } from '@patches/proto/es';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '../api/client.js';

/**
 * Feature flags / remote config (spec §184.3, issue #142): `NodeService.GetNodeInfo`'s
 * `feature_flags`, refetched at most this often. TanStack Query's `staleTime` is this hook's
 * TTL cache — a flag flip on the node becomes visible to an already-open tab within this
 * window without a full reload, and every render in between reads the cached value instead of
 * calling the network.
 */
const FEATURE_FLAGS_TTL_MS = 5 * 60 * 1000;

export interface FeatureFlagView {
  readonly name: string;
  readonly enabled: boolean;
  readonly kind: FeatureFlagKind;
}

function useFeatureFlagsQuery(): UseQueryResult<readonly FeatureFlagView[]> {
  return useQuery({
    queryKey: ['node-info', 'feature-flags'],
    queryFn: async () => {
      const response = await api.node.getNodeInfo({});
      return response.featureFlags ?? [];
    },
    staleTime: FEATURE_FLAGS_TTL_MS,
  });
}

/**
 * Typed accessor: is the named flag enabled right now? An unknown/undeclared name (an older
 * client asking about a flag this node hasn't shipped yet, or a flag retired since) reads as
 * `false` — the honest "not on" answer, never a thrown error, since this can never gate
 * function (§184.3).
 */
export function useFeatureFlag(name: string): boolean {
  const query = useFeatureFlagsQuery();
  return query.data?.some((flag) => flag.name === name && flag.enabled) ?? false;
}

/** The full declared+resolved flag list, for a settings/about screen that wants to render all
 * of them rather than check one by name. */
export function useFeatureFlags(): readonly FeatureFlagView[] {
  const query = useFeatureFlagsQuery();
  return query.data ?? [];
}
