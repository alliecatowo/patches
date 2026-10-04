import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useE2ee } from '../e2ee/use-e2ee.js';
import type { AppSession } from '../api/session.js';
import { clearSeedPlan, loadSeedPlan } from './demo-mode.js';
import { seedDemoInbox } from './seed-inbox.js';

export type DemoSeedState = 'idle' | 'running' | 'done' | 'failed';

/**
 * Once per sandbox, right after the page reloads onto the demo node: seals the fake friends'
 * direct messages to the visitor's own device (see `seed-inbox.ts`). Drives the E2EE manager
 * with the signed-in actor itself so seeding starts without the visitor opening Messages.
 */
export function useDemoSeeding(session: AppSession | null): DemoSeedState {
  const [state, setState] = useState<DemoSeedState>(() =>
    loadSeedPlan() === undefined ? 'idle' : 'running',
  );
  const queryClient = useQueryClient();
  // Binds the visitor's actor to the E2EE manager. Only ever mounted while seeding (see
  // `DemoBanner`), so it can never fight another screen's binding with a stray sign-out.
  useE2ee(session);
  const actorId = session?.actor.id;

  useEffect(() => {
    if (state !== 'running' || actorId === undefined) return;
    const plan = loadSeedPlan();
    // The plan is consumed exactly once; if it is already gone there is nothing left to seed.
    if (plan === undefined) return;
    let cancelled = false;
    seedDemoInbox(plan, actorId)
      .then(() => {
        clearSeedPlan();
        if (cancelled) return;
        setState('done');
        void queryClient.invalidateQueries();
      })
      .catch(() => {
        clearSeedPlan();
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [state, actorId, queryClient]);

  return state;
}
