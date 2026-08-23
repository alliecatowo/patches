/**
 * Authenticated group-membership transitions (ADR 0020 §7, P13-008).
 *
 * Groups stay at pairwise device fanout — no sender key, no MLS — so the only group-level
 * state the protocol needs is a **transcript**: an append-only, device-signed log of
 * membership changes whose length *is* the membership epoch. Adding or removing a member
 * appends one event and bumps the epoch; every payload binds the epoch it was composed
 * under (`assertMembershipEpochCurrent`, `envelopes.ts`), so a message encrypted to a
 * departed member's devices is rejected rather than delivered.
 *
 * Like the per-actor device roster (`roster.ts`), the chain is what makes a hostile node's
 * edits detectable rather than plausible: it cannot rewrite "who was in the group when"
 * without breaking a digest link a member already verified. Unlike the roster, each link is
 * signed by a **device** key (root/device-certified group control events, ADR 0020 §7) —
 * membership is a conversation-level fact, not an account-level one.
 *
 * Nothing here encrypts, decrypts, or derives anything. Signatures and digests are injected.
 */
import { E2EE_GROUP_MAX_MEMBERS, E2EE_PROTOCOL_V1, E2eeContractError } from './modes.js';
import {
  bytesEqual,
  ED25519_SIGNATURE_BYTES,
  E2EE_DIGEST_BYTES,
  isZeroBytes,
  type Bytes,
  type DigestFunction,
  type SignatureVerifier,
} from './types.js';

/** Domain separator for the group-control transcript. Distinct from every other v1 transcript. */
export const E2EE_GROUP_CONTROL_TRANSCRIPT_DOMAIN = `${E2EE_PROTOCOL_V1}:group-control` as const;

/** The two membership transitions v1 defines. No rename, no re-add history erasure. */
export const E2EE_GROUP_CHANGE_KINDS = ['ADDED', 'REMOVED'] as const;
export type E2eeGroupChangeKind = (typeof E2EE_GROUP_CHANGE_KINDS)[number];

/** Fields of a group-control event that `device_signature` covers, decoded-view shape. */
export interface E2eeGroupControlEventFields {
  readonly conversationId: string;

  /** The membership epoch this event establishes. Event 1 is epoch 2: epoch 1 is creation. */
  readonly epoch: bigint;

  readonly change: E2eeGroupChangeKind;

  /** The actor being added or removed — the event's subject, not necessarily its signer. */
  readonly subjectActorId: string;

  /** The member whose device signed the event. */
  readonly signerActorId: string;
  readonly signerDeviceId: string;

  /** All-zero (32 bytes) on the first event; otherwise the previous event's `digest`. */
  readonly previousDigest: Bytes;
}

export type E2eeGroupControlEventView = E2eeGroupControlEventFields & {
  readonly digest: Bytes;

  /** The exact canonical bytes `deviceSignature` covers. Authoritative. */
  readonly eventBytes: Bytes;
  readonly deviceSignature: Bytes;
  readonly createdAt: Date;
};

/** Enough of a verified chain tip to check the next link against. */
export interface E2eeGroupControlChainTip {
  readonly epoch: bigint;
  readonly digest: Bytes;
}

/**
 * The `previous_digest` of the first group-control event: 32 zero bytes.
 *
 * Epoch 1 — the conversation's creation membership — has no signed event, so the first
 * transition (epoch 2) chains from this genesis value. A function for the same reason
 * `rosterGenesisPreviousDigest` is: an exported mutable buffer everyone compares against is
 * a footgun.
 */
export function groupControlGenesisPreviousDigest(): Bytes {
  return new Uint8Array(E2EE_DIGEST_BYTES);
}

/** The membership epoch and transcript digest of a conversation with no transitions yet. */
export function groupControlGenesisTip(): E2eeGroupControlChainTip {
  return { epoch: 1n, digest: groupControlGenesisPreviousDigest() };
}

function encodeLengthPrefixed(parts: readonly Bytes[]): Bytes {
  let size = 0;
  for (const part of parts) size += 4 + part.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let offset = 0;
  for (const part of parts) {
    view.setUint32(offset, part.length, false);
    offset += 4;
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * The exact bytes `device_signature` and `digest` are taken over.
 *
 * In `@patches/domain` from the first byte (ADR 0020 §14.1: canonical transcripts live
 * here) — unlike `certificate_bytes`/`roster_bytes`, whose encoder `apps/server`'s codec
 * owns historically. The signer, the node, and every member all recompute this; one
 * encoder, length-prefixed so no field boundary is ambiguous.
 */
export function canonicalGroupControlTranscript(fields: E2eeGroupControlEventFields): Bytes {
  if (fields.epoch < 0n || fields.epoch > 0xffff_ffff_ffff_ffffn) {
    throw new E2eeContractError('Group-control epoch is out of range.');
  }
  const encoder = new TextEncoder();
  const epoch = new Uint8Array(8);
  new DataView(epoch.buffer).setBigUint64(0, fields.epoch, false);
  return encodeLengthPrefixed([
    encoder.encode(E2EE_GROUP_CONTROL_TRANSCRIPT_DOMAIN),
    encoder.encode(fields.conversationId),
    epoch,
    encoder.encode(fields.change),
    encoder.encode(fields.subjectActorId),
    encoder.encode(fields.signerActorId),
    encoder.encode(fields.signerDeviceId),
    fields.previousDigest,
  ]);
}

/** Structural checks that hold for an event in isolation, before any chain comparison. */
export function assertGroupControlShape(event: E2eeGroupControlEventView): void {
  if (!E2EE_GROUP_CHANGE_KINDS.includes(event.change)) {
    throw new E2eeContractError('Group-control change kind is not one v1 defines.');
  }
  if (
    event.conversationId.length === 0 ||
    event.subjectActorId.length === 0 ||
    event.signerActorId.length === 0 ||
    event.signerDeviceId.length === 0
  ) {
    throw new E2eeContractError('Group-control event is missing an id it must bind.');
  }
  if (event.epoch < 2n) {
    // Epoch 1 is the conversation's creation membership and is established by
    // `CreateE2eeConversation`, not by a control event — so no event may claim it.
    throw new E2eeContractError('Group-control epochs start at 2; epoch 1 is creation.');
  }
  if (event.digest.length !== E2EE_DIGEST_BYTES) {
    throw new E2eeContractError(`Group-control digest must be ${String(E2EE_DIGEST_BYTES)} bytes.`);
  }
  if (event.previousDigest.length !== E2EE_DIGEST_BYTES) {
    throw new E2eeContractError(
      `Group-control previous digest must be ${String(E2EE_DIGEST_BYTES)} bytes.`,
    );
  }
  if (event.deviceSignature.length !== ED25519_SIGNATURE_BYTES) {
    throw new E2eeContractError('Group-control signature must be a 64-byte Ed25519 signature.');
  }
}

/**
 * Verifies that the signer's device key signed this event, and that the digest is over the
 * signed bytes. `signerDeviceSigningKey` is the public half of exactly the device named by
 * `signerDeviceId`, loaded by the caller from the certified device row — never taken from
 * the event itself.
 */
export function verifyGroupControlSignature(
  event: E2eeGroupControlEventView,
  signerDeviceSigningKey: Bytes,
  deps: { readonly verifier: SignatureVerifier; readonly digest: DigestFunction },
): void {
  if (!bytesEqual(deps.digest(event.eventBytes), event.digest)) {
    throw new E2eeContractError('Group-control digest does not match its transcript.');
  }
  if (
    !deps.verifier.verifyEd25519({
      publicKey: signerDeviceSigningKey,
      message: event.eventBytes,
      signature: event.deviceSignature,
    })
  ) {
    throw new E2eeContractError('Group-control event is not signed by the named device.');
  }
}

/**
 * The monotonicity rule. `next` must be a legal successor of `previous` (or, when
 * `previous` is `null`, the first transition of a conversation at genesis epoch 1).
 *
 * Rejected, each because it is a way a node or a member could rewrite the group's history:
 *   * an epoch that is not exactly `previous.epoch + 1` (a gap hides an event, a repeat
 *     replaces one);
 *   * a `previous_digest` that does not chain (a fork);
 *   * a first event that does not chain from the all-zero genesis digest.
 *
 * Membership semantics (subject must not already be a member for ADDED, must be one for
 * REMOVED, member count bounds) need the conversation's actual membership, so they are the
 * node's write-path checks against committed state — not pure functions of two links.
 */
export function assertGroupControlSucceeds(
  previous: E2eeGroupControlChainTip | null,
  next: E2eeGroupControlEventView,
): void {
  assertGroupControlShape(next);

  if (previous === null) {
    if (next.epoch !== 2n) {
      throw new E2eeContractError('A group-control chain must begin at epoch 2.');
    }
    if (!isZeroBytes(next.previousDigest)) {
      throw new E2eeContractError('The first group-control event must chain from genesis.');
    }
    return;
  }

  if (next.epoch !== previous.epoch + 1n) {
    throw new E2eeContractError(
      `Group-control epoch must advance by exactly 1 (expected ${String(previous.epoch + 1n)}, got ${String(next.epoch)}).`,
    );
  }
  if (isZeroBytes(next.previousDigest)) {
    throw new E2eeContractError('Only the first group-control event may chain from genesis.');
  }
  if (!bytesEqual(next.previousDigest, previous.digest)) {
    throw new E2eeContractError('Group-control event does not chain to the previous digest.');
  }
}

/**
 * The member-count bound after a transition lands: 1..`E2EE_GROUP_MAX_MEMBERS`. Removing
 * the last member is allowed (the conversation simply has nobody left to send); adding past
 * eight is not — the same constant `CreateE2eeConversation` enforces at creation
 * (`E2EE_GROUP_MAX_MEMBERS`, spec §183.3's legacy DM bound restated for E2EE by ADR 0020 §7).
 */
export function assertGroupSizeWithinBound(memberCount: number): void {
  if (!Number.isInteger(memberCount) || memberCount < 1 || memberCount > E2EE_GROUP_MAX_MEMBERS) {
    throw new E2eeContractError(
      `An E2EE conversation has 1..${String(E2EE_GROUP_MAX_MEMBERS)} members.`,
    );
  }
}

/** Folds {@link assertGroupControlSucceeds} across a whole chain, oldest first. */
export function assertGroupControlChain(events: readonly E2eeGroupControlEventView[]): void {
  let previous: E2eeGroupControlChainTip | null = null;
  for (const event of events) {
    assertGroupControlSucceeds(previous, event);
    previous = { epoch: event.epoch, digest: event.digest };
  }
}
