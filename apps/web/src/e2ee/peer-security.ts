import type { PatchesApi } from '@patches/client';

/**
 * Peer-security baseline + comparison (A-072, mirroring the TUI's `MessagesScreen` interstitials).
 *
 * When a thread opens we capture the peer's identity root and device roster exactly as the node
 * served them; on a periodic re-check any movement in the root (generation or public key) or in
 * the roster (sequence or digest) since that baseline raises a `identityChanged`/`rosterChanged`
 * status, and the send path refuses until the user re-verifies via the safety-number route and
 * reopens the thread. This is a *baseline vs. now* guard — it is what catches a peer who rotated
 * between our open and our send even when the change was legitimate, which the long-lived pin
 * verification in `chain.ts` intentionally does not. Failing closed when a re-check errors (never
 * treating "couldn't reach the node" as "all clear") is deliberate.
 */

/** Baseline security facts captured when a thread opens; changes against them refuse sends. */
export interface PeerSecurityBaseline {
  readonly actorId: string;
  readonly rootGeneration: number;
  readonly rootPublicKeyHex: string;
  readonly rosterSequence: string;
  readonly rosterDigestHex: string;
}

export type PeerSecurityStatus =
  | { readonly status: 'ok' }
  | { readonly status: 'identityChanged' }
  | { readonly status: 'rosterChanged' };

/** How often the open thread re-checks the peer's root/roster against the open-time baseline. */
export const PEER_SECURITY_POLL_MS = 30_000;

/**
 * Copy shown when the peer's messaging identity root changed since thread open. Matches the TUI's
 * `IDENTITY_CHANGED_COPY` (no keybinding here — the web points at the safety-number route the
 * thread header already links to instead of "press s").
 */
export const PEER_IDENTITY_CHANGED_COPY =
  "The other side's messaging identity changed since you opened this conversation. " +
  'Sending is paused until you re-verify — compare safety numbers, then close and reopen this conversation.';

/** Copy shown when the peer's enrolled devices changed since thread open (matches the TUI). */
export const PEER_ROSTER_CHANGED_COPY =
  "The other side's enrolled devices changed since you opened this conversation. " +
  'Verify before sending — compare safety numbers.';

/** RFC 4648-free hex for comparing wire bytes without leaking body content (used only for equality). */
function toHex(bytes: Uint8Array | undefined): string {
  if (bytes === undefined) return '';
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
/**
 * A peer snapshot fetch plus the node's `identityChangedSinceAcknowledged` flag, which only the
 * identity-root RPC carries.
 */
export interface PeerSecuritySnapshot {
  readonly baseline: PeerSecurityBaseline;
  readonly identityChangedSinceAcknowledged: boolean;
}

/**
 * Captures the peer's current identity root and device roster from the node, exactly as served.
 * Deliberately *not* re-verified here: this is the "now" half of a baseline-vs-now comparison, and
 * `chain.ts`'s pin verification is the separate long-lived guarantee. A network/transport failure
 * propagates so the caller can fail closed rather than guess.
 */
export async function capturePeerSecuritySnapshot(
  api: PatchesApi,
  actorId: string,
): Promise<PeerSecuritySnapshot> {
  const [rootResponse, rosterResponse] = await Promise.all([
    api.e2ee.getIdentityRoot({ actorId }),
    api.e2ee.getDeviceRoster({ actorId }),
  ]);
  const root = rootResponse.identityRoot;
  const roster = rosterResponse.roster;
  return {
    baseline: {
      actorId,
      rootGeneration: root?.generation ?? 0,
      rootPublicKeyHex: toHex(root?.publicKey),
      rosterSequence: String(roster?.sequence ?? 0n),
      rosterDigestHex: toHex(roster?.digest),
    },
    identityChangedSinceAcknowledged: rootResponse.identityChangedSinceAcknowledged,
  };
}

/**
 * Compares an observed snapshot against the thread-open baseline, mirroring the TUI's rule order:
 * an identity-root movement (or the node telling us the root changed since last acknowledgement)
 * is a hard `identityChanged`; a roster movement is `rosterChanged`; otherwise `ok`. A missing
 * actor id on either side is treated as a change rather than "nothing to compare", so a peer that
 * disappears never slips through as unchanged.
 */
export function comparePeerSecurity(
  baseline: PeerSecurityBaseline,
  observed: PeerSecurityBaseline,
  identityChangedSinceAcknowledged: boolean,
): PeerSecurityStatus {
  if (
    baseline.actorId !== observed.actorId ||
    baseline.rootPublicKeyHex !== observed.rootPublicKeyHex ||
    baseline.rootGeneration !== observed.rootGeneration ||
    identityChangedSinceAcknowledged === true
  ) {
    return { status: 'identityChanged' };
  }
  if (
    baseline.rosterSequence !== observed.rosterSequence ||
    baseline.rosterDigestHex !== observed.rosterDigestHex
  ) {
    return { status: 'rosterChanged' };
  }
  return { status: 'ok' };
}
