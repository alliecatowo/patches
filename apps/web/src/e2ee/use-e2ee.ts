/**
 * React glue for the web E2EE manager: binds the signed-in actor to the manager's
 * lifecycle and exposes its status as a reactive hook.
 */
import { useEffect, useSyncExternalStore } from 'react';

import { webE2ee, type WebE2eeStatus } from './web-e2ee.js';

/** Minimal actor shape the manager needs (satisfied by `useSession()`'s snapshot). */
export interface E2eeSessionActor {
  readonly actor: { readonly id: string } | null;
}

/**
 * Drives the E2EE manager with the signed-in actor (opening/closing the vault on
 * sign-in/out/switch) and subscribes this component to status transitions.
 */
export function useE2ee(session: E2eeSessionActor | null): WebE2eeStatus {
  const manager = webE2ee();
  const actorId = session?.actor?.id ?? null;
  useEffect(() => {
    void manager.setActor(actorId === null ? null : { id: actorId });
  }, [manager, actorId]);
  return useSyncExternalStore(
    (listener) => manager.subscribe(listener),
    () => manager.getStatus(),
    () => manager.getStatus(),
  );
}
