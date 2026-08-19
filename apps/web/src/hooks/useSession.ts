import { useSyncExternalStore } from 'react';

import { getSession, subscribeSession, type StoredSession } from '../api/session.js';

/** The signed-in actor + tokens, or `null` when signed out. Re-renders on any change. */
export function useSession(): StoredSession | null {
  return useSyncExternalStore(subscribeSession, getSession, () => null);
}
