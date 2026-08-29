import { useEffect, useRef, useState } from 'react';

import { api } from '../api/client.js';
import {
  capturePeerSecuritySnapshot,
  comparePeerSecurity,
  PEER_SECURITY_POLL_MS,
  type PeerSecurityBaseline,
  type PeerSecurityStatus,
} from '../e2ee/peer-security.js';

/**
 * Watches the open thread's peer for identity/roster movement (A-072), mirroring the TUI's
 * `MessagesScreen` interstitials (§ P13-010): capture a baseline on open, re-check on a cadence,
 * and fail closed — a failed re-check never clears a previously raised status, and never treats
 * "couldn't reach the node" as "all clear".
 *
 * Returns the current status. The caller (the thread route) refuses sends while the status is
 * `identityChanged` or `rosterChanged`. Reopening a thread (a new `conversationId`/`peerActorId`)
 * re-baselines, exactly as the TUI does.
 */
export function usePeerSecurityWatch(
  conversationId: string,
  peerActorId: string | undefined,
): PeerSecurityStatus {
  const [status, setStatus] = useState<PeerSecurityStatus>({ status: 'ok' });
  const baselineRef = useRef<PeerSecurityBaseline | undefined>(undefined);

  // Reset the status when the watched thread/peer changes, synchronously in render
  // (React's documented pattern for adjusting state from a changed prop) rather than in
  // the effect below, which `react-hooks/set-state-in-effect` would otherwise flag. The
  // baseline ref is cleared in the effect so the first re-check re-baselines.
  const [scope, setScope] = useState({ conversationId, peerActorId });
  if (scope.conversationId !== conversationId || scope.peerActorId !== peerActorId) {
    setScope({ conversationId, peerActorId });
    setStatus({ status: 'ok' });
  }

  useEffect(() => {
    // Reset the baseline every time the watched thread (re)opens. A peer swap/missing
    // peer is handled by the comparison itself (actorId mismatch reads as a change), but
    // we still don't poll until we have a concrete peer id to fetch.
    baselineRef.current = undefined;
    if (conversationId === '' || peerActorId === undefined) return undefined;

    let cancelled = false;

    const check = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const snapshot = await capturePeerSecuritySnapshot(api, peerActorId);
        if (cancelled) return;
        const baseline = baselineRef.current;
        if (baseline === undefined) {
          baselineRef.current = snapshot.baseline;
          setStatus({ status: 'ok' });
          return;
        }
        setStatus(
          comparePeerSecurity(
            baseline,
            snapshot.baseline,
            snapshot.identityChangedSinceAcknowledged,
          ),
        );
      } catch {
        // A failed re-check is never treated as "all clear": keep whatever the last successful
        // check concluded. The next poll retries (P13-010).
      }
    };

    void check();
    const timer = setInterval(() => void check(), PEER_SECURITY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [conversationId, peerActorId]);

  return status;
}
