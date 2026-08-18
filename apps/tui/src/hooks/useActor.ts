import type { Actor } from '@patches/proto';
import { useEffect, useState } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';

export type ActorState =
  | { status: 'loading' }
  | { status: 'ready'; actor: Actor }
  | { status: 'error'; error: FriendlyError };

const LOADING: ActorState = { status: 'loading' };

/**
 * Fetches one actor's full profile by id for `ProfileScreen` (spec §68).
 *
 * When `known` is already the full `Actor` — e.g. the caller's own profile,
 * already on the current `ActiveSession` — it is returned directly rather
 * than mirrored into state, so there is no RPC and nothing for the fetch
 * effect to set synchronously. When it does fetch, the "loading" value is
 * *derived* (keyed by `actorId`) rather than written by the effect, the same
 * pattern `useServerInfo` uses — writing state synchronously inside an
 * effect body triggers a cascading render (react-hooks/set-state-in-effect).
 */
export function useActor(api: PatchesApi, actorId: string, known?: Actor): ActorState {
  const [outcome, setOutcome] = useState<{ actorId: string; state: ActorState } | undefined>();
  const fetched = outcome !== undefined && outcome.actorId === actorId ? outcome.state : LOADING;

  useEffect(() => {
    if (known !== undefined) return;
    let cancelled = false;
    api
      .getActor({ id: actorId })
      .then((response) => {
        if (cancelled) return;
        if (response.actor === undefined) {
          setOutcome({
            actorId,
            state: {
              status: 'error',
              error: { title: 'That actor no longer exists.', hint: '', retryable: false, code: 5 },
            },
          });
          return;
        }
        setOutcome({ actorId, state: { status: 'ready', actor: response.actor } });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOutcome({
            actorId,
            state: { status: 'error', error: describeGrpcError(error, api.target) },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [actorId, api, known]);

  return known !== undefined ? { status: 'ready', actor: known } : fetched;
}
