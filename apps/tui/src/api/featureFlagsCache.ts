import type { PatchesApi } from './client.js';
import type { FeatureFlag } from './wire/types.js';

/**
 * Feature flags / remote config (spec §184.3, issue #142) — a module-level TTL cache for
 * `NodeService.GetNodeInfo`'s `feature_flags`, mirroring the ambient-token module's "one TUI
 * process talks to exactly one node" convention (`api/ambient-token.ts`). A screen re-mount
 * (navigating away and back) must not re-fetch the whole flag list every time; a node-side flag
 * flip becomes visible to a long-running TUI session within this window regardless.
 */
const FEATURE_FLAGS_TTL_MS = 5 * 60 * 1000;

let cachedFlags: readonly FeatureFlag[] | undefined;
let cachedAt = 0;
let inFlight: Promise<readonly FeatureFlag[]> | undefined;

/**
 * Returns the cached flag list when it's younger than the TTL, otherwise fetches a fresh one
 * from `api.getNodeInfo()`. Concurrent callers during a fetch share the one in-flight request
 * rather than each issuing their own RPC.
 */
export async function getFeatureFlags(api: PatchesApi): Promise<readonly FeatureFlag[]> {
  const now = Date.now();
  if (cachedFlags !== undefined && now - cachedAt < FEATURE_FLAGS_TTL_MS) {
    return cachedFlags;
  }
  if (inFlight !== undefined) return inFlight;

  inFlight = api
    .getNodeInfo()
    .then((response) => {
      const flags = response.featureFlags ?? [];
      cachedFlags = flags;
      cachedAt = Date.now();
      return flags;
    })
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}

/** Test-only: clears the cache so each test starts from a cold cache. */
export function resetFeatureFlagsCache(): void {
  cachedFlags = undefined;
  cachedAt = 0;
  inFlight = undefined;
}
