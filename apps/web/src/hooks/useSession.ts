import { useSyncExternalStore } from 'react';

import { sessionManager } from '../api/client.js';
import { getActorSession, subscribeActorSession, type AppSession } from '../api/session.js';

/** The signed-in actor, or `null` when signed out. Re-renders on any change. */
export function useSession(): AppSession | null {
  return useSyncExternalStore(subscribeActorSession, getActorSession, () => null);
}

/**
 * When the current access token expires — its `exp` claim, decoded from the JWT, as ms
 * since epoch (B-169 proactive-refresh UI). `undefined` when signed out, before the
 * credential store's first load resolves, or when the token has no parseable `exp`.
 * Re-renders on login, logout, token refresh, and cross-tab credential changes.
 */
export function useSessionExpiry(): number | undefined {
  const snapshot = useSyncExternalStore(
    (listener) => sessionManager.subscribe(listener),
    () => sessionManager.getSnapshot(),
    () => sessionManager.getSnapshot(),
  );
  return snapshot.expiresAt;
}
