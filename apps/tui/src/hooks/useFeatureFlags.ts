import type { PatchesApi } from '../api/client.js';
import type { FeatureFlag } from '../api/wire/types.js';
import { useEffect, useState } from 'react';

import { getFeatureFlags } from '../api/featureFlagsCache.js';

/**
 * Feature flags / remote config (spec §184.3, issue #142). All network access lives behind
 * this hook (spec §68) — it never fetches during render, only from the effect below, and reads
 * through `api/featureFlagsCache.ts`'s TTL cache rather than hitting the network on every
 * mount.
 */
export function useFeatureFlags(api: PatchesApi): readonly FeatureFlag[] {
  const [flags, setFlags] = useState<readonly FeatureFlag[]>([]);

  useEffect(() => {
    let cancelled = false;
    getFeatureFlags(api)
      .then((result) => {
        if (!cancelled) setFlags(result);
      })
      .catch(() => {
        // An unreachable node just means "no flags yet" here — `useServerInfo`/the offline
        // banner already own surfacing connectivity errors to the user.
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return flags;
}

/** Typed accessor: is the named flag enabled right now? An unknown/undeclared name reads as
 * `false` — never thrown — since a flag can never gate function (§184.3). */
export function useFeatureFlag(api: PatchesApi, name: string): boolean {
  const flags = useFeatureFlags(api);
  return flags.some((flag) => flag.name === name && flag.enabled);
}
