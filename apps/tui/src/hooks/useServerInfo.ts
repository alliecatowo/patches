import type { GetServerInfoResponse } from '@patches/proto';
import { useCallback, useEffect, useState } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';

export type ServerInfoState =
  | { status: 'connecting' }
  | { status: 'ready'; info: GetServerInfoResponse }
  | { status: 'error'; error: FriendlyError };

export interface UseServerInfoResult {
  state: ServerInfoState;
  /** Re-run the call. Safe to invoke while one is already in flight. */
  retry: () => void;
}

const CONNECTING: ServerInfoState = { status: 'connecting' };

/**
 * Fetches `SystemService.GetServerInfo` and keeps the result in React state.
 *
 * All network access lives behind this hook so screens stay pure presentation
 * (spec §68).
 */
export function useServerInfo(api: PatchesApi): UseServerInfoResult {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{ attempt: number; state: ServerInfoState }>();

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
    setAttempt((value) => value + 1);
  }, []);

  return { state, retry };
}
