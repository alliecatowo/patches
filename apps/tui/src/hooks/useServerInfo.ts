import type { GetServerInfoResponse } from '../api/wire/types.js';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';

export type ServerInfoState =
  | { status: 'connecting' }
  | { status: 'ready'; info: GetServerInfoResponse }
  | { status: 'error'; error: FriendlyError };

export interface UseServerInfoResult {
  state: ServerInfoState;
  /** Re-run the call now (`Ctrl+R`). Safe to invoke while one is already in flight; resets the
   * auto-retry backoff back to its first step. */
  retry: () => void;
  /**
   * Epoch ms of the next scheduled auto-retry, while `state.status === 'error'` and the error
   * is `retryable`; `undefined` when there's nothing scheduled (ready, connecting, or a
   * non-retryable error). Drives `Banner`'s `offline — retrying in Ns` countdown — `Ctrl+R`
   * works at any time regardless and reschedules from here.
   */
  retryAt: number | undefined;
}

const CONNECTING: ServerInfoState = { status: 'connecting' };

/** The API layer's retry schedule (interaction model §6): back off 2s, 4s, 8s, 16s, then hold
 * at 30s between attempts rather than hammering an unreachable node forever. */
const RETRY_SCHEDULE_MS = [2000, 4000, 8000, 16000, 30000] as const;

function delayForStreak(streak: number): number {
  const index = Math.min(streak, RETRY_SCHEDULE_MS.length - 1);
  // `index` is always in range (clamped above); the fallback only satisfies
  // noUncheckedIndexedAccess, matching the schedule's own last (30s) step.
  return RETRY_SCHEDULE_MS[index] ?? 30_000;
}

/**
 * Fetches `SystemService.GetServerInfo` and keeps the result in React state, auto-retrying a
 * retryable failure on an exponential backoff so the offline banner (`components/Banner.tsx`)
 * has something live to count down.
 *
 * All network access lives behind this hook so screens stay pure presentation (spec §68).
 */
export function useServerInfo(api: PatchesApi): UseServerInfoResult {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{ attempt: number; state: ServerInfoState }>();
  const [retryAt, setRetryAt] = useState<number | undefined>(undefined);
  // Backoff bookkeeping only — mutated inside effect/event-handler bodies, never during
  // render, so it never trips `react-hooks/refs`.
  const streak = useRef(0);

  // The "connecting" state is *derived* from the attempt counter rather than
  // written by the effect: setting state synchronously inside an effect body
  // triggers a cascading render (react-hooks/set-state-in-effect).
  const state = outcome !== undefined && outcome.attempt === attempt ? outcome.state : CONNECTING;

  useEffect(() => {
    let cancelled = false;

    api
      .getServerInfo()
      .then((info) => {
        if (cancelled) return;
        streak.current = 0;
        setOutcome({ attempt, state: { status: 'ready', info } });
        setRetryAt(undefined);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const friendly = describeGrpcError(error, api.target);
        setOutcome({ attempt, state: { status: 'error', error: friendly } });
        // Computed here, inside the promise callback — never during render, so
        // `Date.now()` (an impure call) is fine (react-hooks/purity only restricts render).
        setRetryAt(friendly.retryable ? Date.now() + delayForStreak(streak.current) : undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const retry = useCallback(() => {
    streak.current = 0;
    setRetryAt(undefined);
    setAttempt((value) => value + 1);
  }, []);

  // Pure scheduling: once `retryAt` is known (set above, from the fetch effect's own
  // callback), arm exactly one timer for it. The only `setState` this effect ever calls is
  // inside the timer's own callback — never synchronously in the effect body.
  useEffect(() => {
    if (retryAt === undefined) return;
    const delay = Math.max(0, retryAt - Date.now());
    const timer = setTimeout(() => {
      streak.current += 1;
      setAttempt((value) => value + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [retryAt]);

  return { state, retry, retryAt };
}
