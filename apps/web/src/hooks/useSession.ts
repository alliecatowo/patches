import { useSyncExternalStore } from 'react';

import { getActorSession, subscribeActorSession, type AppSession } from '../api/session.js';

/** The signed-in actor, or `null` when signed out. Re-renders on any change. */
export function useSession(): AppSession | null {
  return useSyncExternalStore(subscribeActorSession, getActorSession, () => null);
}
