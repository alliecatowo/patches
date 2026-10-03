/**
 * Explicit re-trust of a peer whose messaging identity was reset without a countersignature
 * (audit P2-H2).
 *
 * A planned rotation is countersigned by the peer's previous root key, so `verifyMessagingRoot`
 * accepts it against the pin. A reset is what an account does when it has lost that key (ADR
 * 0037 §2): the new root is self-signed only. Before this module the pin check simply threw, so
 * every send to the peer and every initial envelope from them failed until this browser's vault
 * was wiped. A client must still never trust a new root silently (ADR 0020 §3), so the way out is
 * an action the user takes after comparing the new safety number out of band:
 *
 *   - `PeerIdentityResetError` is what the transports throw instead of an opaque verification
 *     failure, so the UI can say what happened and where to resolve it;
 *   - `acceptPeerIdentityReset` re-pins exactly the root bytes the user was shown, only if they
 *     are validly self-signed for the same actor with a strictly higher generation (a lower or
 *     equal generation is a rollback and is refused), and clears any earlier safety-number mark.
 */
import { bytesEqual, verifyMessagingRoot } from '@patches/crypto';
import { E2eeContractError } from '@patches/domain';

import {
  loadPeerIdentityPin,
  savePeerIdentityPin,
  setSafetyNumberVerified,
  type PeerIdentityPin,
  type PeerPinVaultAccess,
  type SafetyNumberVaultAccess,
} from './vault.js';

/** The slice of a served identity root this module reads (wire shape, structural). */
export interface ServedIdentityRoot {
  readonly rootBytes: Uint8Array;
  readonly selfSignature: Uint8Array;
  readonly previousRootSignature?: Uint8Array | undefined;
}

export class PeerIdentityResetError extends E2eeContractError {
  readonly actorId: string;

  constructor(actorId: string) {
    super(
      'This contact reset their messaging identity without a signature from their previous key. ' +
        'Compare safety numbers with them, then accept the new identity.',
    );
    this.actorId = actorId;
  }
}

const ZERO_DIGEST = new Uint8Array(32);

/**
 * True when `served` differs from the pinned root and is NOT a countersigned successor, but is
 * a validly self-signed root of the same actor at a strictly higher generation: the shape of a
 * reset the user may choose to accept. Anything else (a lower or equal generation, a bad
 * signature, a different actor) is not offered for acceptance and keeps failing closed.
 */
export function isUnverifiedReset(
  pin: PeerIdentityPin,
  served: ServedIdentityRoot,
  nowMs: number,
): boolean {
  if (bytesEqual(served.rootBytes, pin.rootBytes)) return false;
  try {
    const pinned = verifyMessagingRoot({
      rootBytes: pin.rootBytes,
      selfSignature: pin.selfSignature,
      nowMs,
    });
    const next = verifyMessagingRoot({
      rootBytes: served.rootBytes,
      selfSignature: served.selfSignature,
      nowMs,
    });
    return (
      next.actorId === pinned.actorId &&
      next.generation > pinned.generation &&
      !bytesEqual(next.publicKey, pinned.publicKey)
    );
  } catch {
    // A pin or served root that does not verify is not an acceptable reset.
    return false;
  }
}

export interface AcceptPeerIdentityResetInput {
  readonly vault: PeerPinVaultAccess & SafetyNumberVaultAccess;
  readonly actorId: string;
  /** Exactly the root the user was shown the safety number for. */
  readonly root: ServedIdentityRoot;
  readonly nowMs: number;
}

/**
 * Re-pins `root` as the peer's identity. Callable only from an explicit user confirmation; it
 * never runs on its own. Resets the roster pin (the new generation's roster chain starts over)
 * and clears the old safety-number mark, since that number no longer describes this peer.
 */
export async function acceptPeerIdentityReset(input: AcceptPeerIdentityResetInput): Promise<void> {
  const pin = await loadPeerIdentityPin(input.vault, input.actorId);
  if (pin === undefined) {
    throw new E2eeContractError('There is no pinned identity for this contact to replace.');
  }
  const next = verifyMessagingRoot({
    rootBytes: input.root.rootBytes,
    selfSignature: input.root.selfSignature,
    nowMs: input.nowMs,
  });
  if (next.actorId !== input.actorId) {
    throw new E2eeContractError('That identity root belongs to a different account.');
  }
  if (!isUnverifiedReset(pin, input.root, input.nowMs)) {
    throw new E2eeContractError('That identity root is not an acceptable replacement.');
  }
  await savePeerIdentityPin(input.vault, input.actorId, {
    rootBytes: input.root.rootBytes,
    selfSignature: input.root.selfSignature,
    rosterSequence: 0,
    rosterDigest: ZERO_DIGEST,
  });
  await setSafetyNumberVerified(input.vault, input.actorId, false);
}
