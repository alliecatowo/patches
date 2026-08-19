import type { GetServerInfoResponse } from '@patches/proto';
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
  const streak = useRef(0);
  const [retryAt, setRetryAt] = useState<number | undefined>(undefined);

  // The "connecting" state is *derived* from the attempt counter rather than
  // written by the effect: setting state synchronously inside an effect body
  // triggers a cascading render (react-hooks/set-state-in-effect).
  const state = outcome !== undefined && outcome.attempt === attempt ? outcome.state : CONNECTING;

  useEffect(() => {
    let cancelled = false;

    api
      .getServerInfo()
      .then((info) => {
        if (!cancelled) setOutcome({ attempt, state: { status: 'ready', info } });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOutcome({
            attempt,
            state: { status: 'error', error: describeGrpcError(error, api.target) },
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const retry = useCallback(() => {
    streak.current = 0;
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (state.status === 'ready') {
      streak.current = 0;
      setRetryAt(undefined);
      return;
    }
    if (state.status !== 'error' || !state.error.retryable) {
      setRetryAt(undefined);
      return;
    }
    const delay = delayForStreak(streak.current);
    setRetryAt(Date.now() + delay);
    const timer = setTimeout(() => {
      streak.current += 1;
      setAttempt((value) => value + 1);
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `state` (not `state.status`) is
    // the intended dependency: a new error object (even the same status) should reschedule.
  }, [state]);

  return { state, retry, retryAt };
}
