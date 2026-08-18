import { useEffect, useState } from 'react';

import type { PatchesApi } from '../api/client.js';

const POLL_MS = 60_000;

/**
 * The unread-notification badge in the status bar (spec §56, §113: "the TUI can poll
 * when active and refresh manually" — no push infrastructure in v0). Refetches
 * `NotificationService.GetUnreadCount` whenever `screenKey` changes (cheap — one small
 * RPC on every screen change) and on a 60s interval while signed in; `undefined` while
 * signed out or before the first fetch resolves, so callers never render a stale "0".
 */
export function useUnreadCount(
  api: PatchesApi,
  signedIn: boolean,
  ensureAccessToken: () => Promise<string>,
  screenKey: string,
): number | undefined {
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    // Nothing to poll while signed out — the returned value is derived as
    // `undefined` below rather than `setCount(undefined)` here (no reason to
    // set state synchronously in the effect body just to produce a value
    // already computable from `signedIn`; same pattern as `useActor`).
    if (!signedIn) return undefined;
    let cancelled = false;

    function refresh(): void {
      ensureAccessToken()
        .then((accessToken) => api.getUnreadCount({}, accessToken))
        .then((response) => {
          if (!cancelled) setCount(response.count);
        })
        // Best-effort — a failed poll just leaves the last-known count on screen
        // rather than surfacing an error for a non-critical badge.
        .catch(() => undefined);
    }

    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [api, signedIn, ensureAccessToken, screenKey]);

  return signedIn ? count : undefined;
}
