import { useEffect, useState, type JSX } from 'react';

import type { E2eeGroupControlEvent } from '@patches/proto/es';

import { api } from '../../api/client.js';
import { verifyActorChain, type VerifiedPeerChain } from '../../e2ee/chain.js';
import type { EnrollmentTransport } from '../../e2ee/enrollment.js';
import {
  verifyGroupControlEvents,
  type GroupControlChainLoader,
  type GroupControlRow,
} from '../../e2ee/group-control.js';

export interface GroupControlTranscriptProps {
  readonly conversationId: string;
  readonly transport: EnrollmentTransport;
}

function chainLoaderFor(transport: EnrollmentTransport): GroupControlChainLoader {
  return {
    async loadVerifiedChain(actorId: string): Promise<VerifiedPeerChain | undefined> {
      const [rootWire, rosterResponse] = await Promise.all([
        transport.getIdentityRoot(actorId),
        transport.getDeviceRoster(actorId),
      ]);
      if (rootWire === undefined || rosterResponse.roster === undefined) return undefined;
      try {
        return verifyActorChain({
          rootWire,
          rosterWire: rosterResponse.roster,
          certificatesWire: rosterResponse.certificates,
          now: new Date(),
        });
      } catch {
        return undefined;
      }
    },
  };
}

type TranscriptState =
  | { status: 'loading' }
  | { status: 'ready'; rows: readonly GroupControlRow[] }
  | { status: 'error' };

/**
 * Renders a conversation's membership transcript with per-event signature verification
 * (ADR 0020 §7, P13-008/P13-010; issue #168) — the web counterpart of the TUI's
 * group-control rendering. Every row is independently re-verified against the signer's
 * *certified* device key before it renders; a row that fails is marked, never dropped or
 * shown as ordinary history, so a forged or unverifiable membership claim can never pass
 * silently.
 */
export function GroupControlTranscript({
  conversationId,
  transport,
}: GroupControlTranscriptProps): JSX.Element | null {
  const [state, setState] = useState<TranscriptState>({ status: 'loading' });
  // Same render-time reset pattern as `SafetyNumberPanel` — avoids a synchronous
  // `setState` inside the effect, which `react-hooks/set-state-in-effect` flags.
  const [lastConversationId, setLastConversationId] = useState(conversationId);
  if (conversationId !== lastConversationId) {
    setLastConversationId(conversationId);
    setState({ status: 'loading' });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const events: E2eeGroupControlEvent[] = [];
        let afterEpoch = 0n;
        let cursor = '';
        // Keyset pagination, oldest first (spec §153) — verify forward from epoch 0.
        for (;;) {
          const response = await api.e2ee.listE2eeGroupControlEvents({
            conversationId,
            afterEpoch,
            cursor,
            limit: 50,
          });
          events.push(...response.events);
          const lastEvent = response.events.at(-1);
          if (lastEvent !== undefined) afterEpoch = lastEvent.epoch;
          const nextCursor = response.page?.nextCursor ?? '';
          if (nextCursor === '' || response.events.length === 0) break;
          cursor = nextCursor;
        }
        if (cancelled) return;
        const verdict = await verifyGroupControlEvents(events, chainLoaderFor(transport));
        if (cancelled) return;
        setState({ status: 'ready', rows: verdict.rows });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, transport]);

  if (state.status === 'loading') return <p role="status">Loading membership history…</p>;
  if (state.status === 'error') {
    return <p role="alert">Could not load this conversation&apos;s membership history.</p>;
  }
  if (state.rows.length === 0) return null;

  return (
    <div>
      <h2>Membership history</h2>
      <ul>
        {state.rows.map((row, index) => (
          <li key={`${String(row.epoch)}-${index}`}>
            {row.change === 'ADDED'
              ? `Added ${row.subjectActorId}`
              : row.change === 'REMOVED'
                ? `Removed ${row.subjectActorId}`
                : `Unrecognized membership change for ${row.subjectActorId}`}
            {' — '}
            {row.signatureVerified ? (
              'signature verified'
            ) : (
              <strong role="alert">unverified — not confirmed against a certified device</strong>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
