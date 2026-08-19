/**
 * Monotonic, root-signed device roster contract (ADR 0020 §2).
 *
 * The roster is the only thing standing between a user and a node that quietly adds a device to
 * their account. It is an append-only hash chain signed by the messaging root, so a node can
 * still refuse to serve it or serve a stale one — but it cannot forge one, and a client that
 * verifies the chain forward from its last known sequence detects a rollback or a split view.
 *
 * These validators are what "monotonic" means concretely. They are pure, so both the node (on
 * write) and every client (on read) run exactly the same rules.
 */
import { E2EE_MAX_ACTIVE_DEVICES_PER_ACTOR, E2eeContractError } from './modes.js';
import {
  bytesEqual,
  ED25519_SIGNATURE_BYTES,
  E2EE_DIGEST_BYTES,
  isZeroBytes,
  type Bytes,
  type DigestFunction,
  type SignatureVerifier,
} from './types.js';
import type { E2eeIdentityRootView } from './certificates.js';

/**
 * One device's entry. A device is **marked inactive**, never dropped: an absence and a removal
 * look identical to a peer comparing two rosters, and only one of them is a security event.
 */
export interface E2eeRosterEntryView {
  readonly deviceId: string;
  /** Binds the entry to an exact certificate, so a device id cannot be re-pointed. */
  readonly certificateDigest: Bytes;
  readonly active: boolean;
  readonly addedAt: Date;
  readonly revokedAt?: Date | null | undefined;
}

export interface E2eeDeviceRosterView {
  readonly actorId: string;
  /** Starts at 1 and increases by exactly 1. `bigint` because the column is `bigint`. */
  readonly sequence: bigint;
  readonly rootGeneration: number;
  /** All-zero at sequence 1; otherwise the previous roster's `digest`. */
  readonly previousDigest: Bytes;
  readonly digest: Bytes;
  /** The exact canonical bytes `rootSignature` covers. Authoritative. */
  readonly rosterBytes: Bytes;
  readonly rootSignature: Bytes;
  /** Decoded view of `rosterBytes`. Never trusted on its own. */
  readonly entries: readonly E2eeRosterEntryView[];
  readonly createdAt: Date;
}

/**
 * The `previous_digest` of the first roster in a chain: 32 zero bytes.
 *
 * A function, not a shared constant, because a `Uint8Array` cannot be frozen (V8 rejects
 * `Object.freeze` on a typed array with elements) and an exported mutable buffer that every
 * chain check compares against is a footgun waiting for one careless caller.
 */
export function rosterGenesisPreviousDigest(): Bytes {
  return new Uint8Array(E2EE_DIGEST_BYTES);
}

/** Structural checks that hold for a roster in isolation, before any chain comparison. */
export function assertRosterShape(roster: E2eeDeviceRosterView): void {
  if (roster.sequence < 1n) {
    throw new E2eeContractError('Roster sequence must start at 1.');
  }
  if (roster.digest.length !== E2EE_DIGEST_BYTES) {
    throw new E2eeContractError(`Roster digest must be ${String(E2EE_DIGEST_BYTES)} bytes.`);
  }
  if (roster.previousDigest.length !== E2EE_DIGEST_BYTES) {
    throw new E2eeContractError(
      `Roster previous digest must be ${String(E2EE_DIGEST_BYTES)} bytes.`,
    );
  }
  if (roster.rootSignature.length !== ED25519_SIGNATURE_BYTES) {
    throw new E2eeContractError('Roster signature must be a 64-byte Ed25519 signature.');
  }
  if (roster.sequence === 1n && !isZeroBytes(roster.previousDigest)) {
    throw new E2eeContractError('The first roster must chain from the all-zero digest.');
  }
  if (roster.sequence > 1n && isZeroBytes(roster.previousDigest)) {
    throw new E2eeContractError('Only the first roster may chain from the all-zero digest.');
  }

  const seen = new Set<string>();
  let activeCount = 0;
  for (const entry of roster.entries) {
    if (seen.has(entry.deviceId)) {
      throw new E2eeContractError(`Roster lists device ${entry.deviceId} more than once.`);
    }
    seen.add(entry.deviceId);
    if (entry.certificateDigest.length !== E2EE_DIGEST_BYTES) {
      throw new E2eeContractError('Roster entry certificate digest has the wrong length.');
    }
    if (entry.active) {
      activeCount += 1;
      if (entry.revokedAt !== null && entry.revokedAt !== undefined) {
        throw new E2eeContractError(`Roster entry ${entry.deviceId} is both active and revoked.`);
      }
    }
  }
  if (activeCount > E2EE_MAX_ACTIVE_DEVICES_PER_ACTOR) {
    throw new E2eeContractError(
      `A roster may list at most ${String(E2EE_MAX_ACTIVE_DEVICES_PER_ACTOR)} active devices.`,
    );
  }
}

/**
 * Verifies that the root signed this roster, and that the digest is over the signed bytes.
 *
 * Split from {@link assertRosterShape} because a client verifying a long chain runs the cheap
 * structural check on every link and the signature check on every link too — but a node writing
 * one roster needs both, and keeping them separate makes the test for each unambiguous.
 */
export function verifyRosterSignature(
  roster: E2eeDeviceRosterView,
  root: E2eeIdentityRootView,
  deps: { readonly verifier: SignatureVerifier; readonly digest: DigestFunction },
): void {
  if (roster.actorId !== root.actorId) {
    throw new E2eeContractError('Roster names a different actor than its root.');
  }
  if (roster.rootGeneration !== root.generation) {
    throw new E2eeContractError('Roster was signed by a superseded root generation.');
  }
  if (!bytesEqual(deps.digest(roster.rosterBytes), roster.digest)) {
    throw new E2eeContractError('Roster digest does not match its transcript.');
  }
  if (
    !deps.verifier.verifyEd25519({
      publicKey: root.publicKey,
      message: roster.rosterBytes,
      signature: roster.rootSignature,
    })
  ) {
    throw new E2eeContractError('Roster is not signed by this actor’s messaging root.');
  }
}

/**
 * The monotonicity rule, in full. `next` must be a legal successor of `previous` (or the genesis
 * roster when `previous` is `null`).
 *
 * Rejected, each because it is a way a node could rewrite an account's device history:
 *   * a sequence that is not exactly `previous + 1` (a gap hides a roster, a repeat replaces one);
 *   * a `previous_digest` that does not chain (a fork);
 *   * a decreasing root generation (a downgrade to a superseded root);
 *   * an entry present in `previous` and missing from `next` (a silent removal);
 *   * a device whose `certificate_digest` changed (a device id re-pointed at a new key);
 *   * a revoked device becoming active again (an un-revocation).
 */
export function assertRosterSucceeds(
  previous: E2eeDeviceRosterView | null,
  next: E2eeDeviceRosterView,
): void {
  assertRosterShape(next);

  if (previous === null) {
    if (next.sequence !== 1n) {
      throw new E2eeContractError('A roster chain must begin at sequence 1.');
    }
    return;
  }

  if (next.actorId !== previous.actorId) {
    throw new E2eeContractError('Roster chain switched actors.');
  }
  if (next.sequence !== previous.sequence + 1n) {
    throw new E2eeContractError(
      `Roster sequence must advance by exactly 1 (expected ${String(previous.sequence + 1n)}, got ${String(next.sequence)}).`,
    );
  }
  if (!bytesEqual(next.previousDigest, previous.digest)) {
    throw new E2eeContractError('Roster does not chain to the previous roster digest.');
  }
  if (next.rootGeneration < previous.rootGeneration) {
    throw new E2eeContractError('Roster root generation went backwards.');
  }

  const before = new Map(previous.entries.map((entry) => [entry.deviceId, entry]));
  for (const entry of next.entries) {
    const prior = before.get(entry.deviceId);
    if (prior === undefined) continue;
    if (!bytesEqual(prior.certificateDigest, entry.certificateDigest)) {
      throw new E2eeContractError(
        `Device ${entry.deviceId} changed certificate without a new device id.`,
      );
    }
    if (entry.active && !prior.active) {
      throw new E2eeContractError(
        `Device ${entry.deviceId} was revoked and cannot be reactivated.`,
      );
    }
    before.delete(entry.deviceId);
  }
  const dropped = [...before.keys()];
  if (dropped.length > 0) {
    throw new E2eeContractError(
      `Roster dropped device(s) ${dropped.join(', ')}; a device is marked inactive, never removed.`,
    );
  }
}

/** Folds {@link assertRosterSucceeds} across a whole chain, oldest first. */
export function assertRosterChain(rosters: readonly E2eeDeviceRosterView[]): void {
  let previous: E2eeDeviceRosterView | null = null;
  for (const roster of rosters) {
    assertRosterSucceeds(previous, roster);
    previous = roster;
  }
}

/**
 * Guards against a node serving an older roster than the client has already verified. Equal is
 * fine (a re-fetch); lower never is.
 */
export function assertRosterNotRolledBack(
  highestVerifiedSequence: bigint,
  served: E2eeDeviceRosterView,
): void {
  if (served.sequence < highestVerifiedSequence) {
    throw new E2eeContractError(
      `Node served roster sequence ${String(served.sequence)} below the verified ${String(highestVerifiedSequence)}; this is a rollback.`,
    );
  }
}

/** The device ids a sender must encrypt to. Sorted, so a fanout transcript is deterministic. */
export function activeDeviceIds(roster: E2eeDeviceRosterView): readonly string[] {
  return roster.entries
    .filter((entry) => entry.active)
    .map((entry) => entry.deviceId)
    .sort();
}
