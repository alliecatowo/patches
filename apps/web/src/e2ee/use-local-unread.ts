/**
 * React glue for the durable per-conversation unread store (issue #383): loads this
 * device's local unread for a set of conversation ids and exposes it as a map for the
 * conversation list to merge against the server's `unreadCount`.
 *
 * Only conversations this browser has actually engaged are present in the returned map
 * (a locally-read thread is present with `0`); a missing key MEANS "no local record —
 * fall back to the server count" (`mergeUnread`). Re-loads whenever the id set changes.
 */
import { useEffect, useState } from 'react';

import { webE2ee } from './web-e2ee.js';

/** `conversationId -> local unread count`. A missing key means "no local record yet". */
export type LocalUnreadMap = ReadonlyMap<string, number>;

export function useLocalUnreadCounts(
  conversationIds: readonly string[],
  enabled: boolean,
): LocalUnreadMap {
  const [local, setLocal] = useState<LocalUnreadMap>(new Map());
  // Reset synchronously in render when the list becomes unavailable (sign-out, vault
  // loss) rather than in an effect — the same documented pattern `useE2eeVaultAccess`
  // uses, which `react-hooks/set-state-in-effect` otherwise rejects.
  const [lastEnabled, setLastEnabled] = useState(enabled);
  if (enabled !== lastEnabled) {
    setLastEnabled(enabled);
    if (!enabled) setLocal(new Map());
  }
  const key = conversationIds.join('\u0000');
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const entries = new Map<string, number>();
      // Split the joined `key` back out rather than referencing `conversationIds` so the
      // effect's only list dependency is the stable `key` (a fresh `conversationIds` array
      // is allocated every render, and depending on it would re-run the effect each time).
      for (const conversationId of key === '' ? [] : key.split('\u0000')) {
        if (cancelled) return;
        try {
          const count = await webE2ee().getUnreadCount(conversationId);
          if (count !== undefined) entries.set(conversationId, count);
        } catch {
          // A missing/failed vault is not a statement about unread — it stops the merge
          // and falls back to the server count for that conversation.
        }
      }
      if (cancelled) return;
      setLocal(entries);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, key]);

  return local;
}
