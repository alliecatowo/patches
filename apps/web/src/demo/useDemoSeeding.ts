import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useE2ee } from '../e2ee/use-e2ee.js';
import type { AppSession } from '../api/session.js';
import { clearSeedPlan, loadSeedPlan } from './demo-mode.js';
import { seedDemoInbox, SeedError, type SeedStep } from './seed-inbox.js';

export type DemoSeedState = 'idle' | 'running' | 'done' | 'failed';

export interface DemoSeeding {
  readonly state: DemoSeedState;
  readonly step: SeedStep;
  readonly friendsDone: number;
  readonly friendsTotal: number;
  /** Copy that is safe to show, set while `state` is `failed`. */
  readonly error: string | undefined;
  /** Resumes from the last recorded progress after a failure. */
  readonly retry: () => void;
}

/**
 * Once per sandbox, right after the page reloads onto the demo node: seals the fake friends'
 * direct messages to the visitor's own device (see `seed-inbox.ts`) and reports real progress
 * for the setup screen. Drives the E2EE manager with the signed-in actor itself so seeding
 * starts without the visitor opening Messages. A reload while it runs resumes, because the
 * seed plan and its progress live in `sessionStorage` until sealing finishes.
 */
export function useDemoSeeding(session: AppSession | null): DemoSeeding {
  const [state, setState] = useState<DemoSeedState>(() =>
    loadSeedPlan() === undefined ? 'idle' : 'running',
  );
  const [step, setStep] = useState<SeedStep>('keys');
  const [counts, setCounts] = useState({ done: 0, total: 3 });
  const [error, setError] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();
  // Binds the visitor's actor to the E2EE manager. Only ever mounted while seeding, so it can
  // never fight another screen's binding with a stray sign-out.
  useE2ee(session);
  const actorId = session?.actor.id;

  useEffect(() => {
    if (state !== 'running' || actorId === undefined) return;
    const plan = loadSeedPlan();
    // The plan is consumed exactly once; if it is already gone there is nothing left to seed.
    if (plan === undefined) return;
    let cancelled = false;
    seedDemoInbox(plan, actorId, (event) => {
      if (cancelled) return;
      setStep(event.step);
      setCounts({ done: event.friendsDone, total: event.friendsTotal });
    })
      .then(() => {
        clearSeedPlan();
        if (cancelled) return;
        setState('done');
        void queryClient.invalidateQueries();
      })
      .catch((caught: unknown) => {
        // The plan stays so Retry (or a reload) resumes instead of starting over.
        if (cancelled) return;
        setError(
          caught instanceof SeedError ? caught.message : 'Your sandbox could not be finished.',
        );
        setState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [state, actorId, queryClient]);

  const retry = useCallback(() => {
    setError(undefined);
    setState('running');
  }, []);

  return {
    state,
    step,
    friendsDone: counts.done,
    friendsTotal: counts.total,
    error,
    retry,
  };
}
