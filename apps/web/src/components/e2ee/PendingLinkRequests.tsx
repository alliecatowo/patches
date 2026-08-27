/**
 * Authority-side "Pending link requests" (ADR 0037 §1 steps 2–3): lists this account's
 * pending link offers, each with its own freshly re-derived SAS, and gates approval behind
 * an explicit "the code matches" confirmation — `approveLinkOffer` itself does not ask
 * again (see its doc comment), so this checkbox IS the confirmation the ADR requires.
 * A mismatch never retries silently: it discards the offer via `cancelDeviceLink` directly.
 */
import { useCallback, useEffect, useState, type JSX } from 'react';

import {
  approveLinkOffer,
  listLinkOffers,
  DeviceLinkError,
  type PendingLinkOfferSummary,
} from '../../e2ee/device-link.js';
import type { EnrollmentTransport } from '../../e2ee/enrollment.js';
import type { RatchetSessionVault } from '../../e2ee/vault.js';

/** ADR 0037 §1: how often the authority device refreshes its pending-offer list. */
const LIST_POLL_MS = 5_000;

export const NOT_AUTHORITY_COPY =
  'This device cannot approve links: it does not hold the messaging identity root.';

export const MISMATCH_DISCARD_COPY =
  'The node showed this device different keys. Nothing was approved.';

export interface PendingLinkRequestsProps {
  readonly actorId: string;
  readonly vault: RatchetSessionVault;
  readonly transport: EnrollmentTransport;
  /** Test seam only; defaults to the real poll cadence. */
  readonly pollIntervalMs?: number;
}

function formatExpiry(expiresAtMs: number, nowMs: number): string {
  const remainingMs = expiresAtMs - nowMs;
  if (remainingMs <= 0) return 'expired';
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1_000);
  return `expires in ${String(minutes)}m ${String(seconds).padStart(2, '0')}s`;
}

export function PendingLinkRequests(props: PendingLinkRequestsProps): JSX.Element {
  const { actorId, vault, transport, pollIntervalMs = LIST_POLL_MS } = props;
  const [offers, setOffers] = useState<readonly PendingLinkOfferSummary[]>([]);
  const [notAuthority, setNotAuthority] = useState(false);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [approvingId, setApprovingId] = useState<string | undefined>(undefined);
  const [dismissedNotice, setDismissedNotice] = useState<string | undefined>(undefined);
  const [now, setNow] = useState<number>(() => Date.now());

  // Pure fetch, no state writes — safe to reference from the effect below (mirrors
  // `MessageThreadRoute.tsx`'s poll-effect shape: the actual state updates happen in a
  // function defined INSIDE the effect, never in a hoisted callback the effect just calls).
  const loadOffers = useCallback(
    () => listLinkOffers({ actorId, transport, vault, nowMs: () => Date.now() }),
    [actorId, transport, vault],
  );

  // Used by the approve/discard handlers below (event handlers, not effect bodies).
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await loadOffers();
      setOffers(result);
      setNotAuthority(false);
    } catch (error) {
      setOffers([]);
      setNotAuthority(error instanceof DeviceLinkError && error.reason === 'not-authority');
    }
  }, [loadOffers]);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        const result = await loadOffers();
        if (cancelled) return;
        setOffers(result);
        setNotAuthority(false);
        setNow(Date.now());
      } catch (error) {
        if (cancelled) return;
        setOffers([]);
        setNotAuthority(error instanceof DeviceLinkError && error.reason === 'not-authority');
        setNow(Date.now());
      }
    };
    void run();
    const interval = setInterval(() => void run(), pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loadOffers, pollIntervalMs]);

  async function handleApprove(linkId: string): Promise<void> {
    setApprovingId(linkId);
    try {
      await approveLinkOffer({ actorId, linkId, transport, vault, nowMs: () => Date.now() });
      await refresh();
    } finally {
      setApprovingId(undefined);
    }
  }

  async function handleMismatch(linkId: string): Promise<void> {
    await transport.cancelDeviceLink(linkId);
    setDismissedNotice(MISMATCH_DISCARD_COPY);
    await refresh();
  }

  if (notAuthority) {
    return (
      <section aria-label="Pending link requests">
        <h2>Pending link requests</h2>
        <p role="alert">{NOT_AUTHORITY_COPY}</p>
      </section>
    );
  }

  return (
    <section aria-label="Pending link requests">
      <h2>Pending link requests</h2>
      {dismissedNotice === undefined ? null : <p role="status">{dismissedNotice}</p>}
      {offers.length === 0 ? <p>No devices are waiting to be linked.</p> : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {offers.map((offer) => {
          const isChecked = confirmed[offer.linkId] === true;
          return (
            <li
              key={offer.linkId}
              style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}
            >
              <div>Device {offer.deviceId.slice(0, 8)}</div>
              <div
                aria-label="Safety code"
                style={{ fontFamily: 'monospace', fontSize: '1.25rem', letterSpacing: '0.08em' }}
              >
                {offer.sas.split('-').join('  ')}
              </div>
              <div>{formatExpiry(offer.expiresAtMs, now)}</div>
              <label>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) =>
                    setConfirmed((current) => ({ ...current, [offer.linkId]: e.target.checked }))
                  }
                />
                The code on the other device matches
              </label>
              <div>
                <button
                  type="button"
                  disabled={!isChecked || approvingId === offer.linkId}
                  onClick={() => void handleApprove(offer.linkId)}
                >
                  {approvingId === offer.linkId ? 'Approving…' : 'Approve'}
                </button>
                <button type="button" onClick={() => void handleMismatch(offer.linkId)}>
                  Doesn&apos;t match
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
