/**
 * Monotonic, root-signed group membership contract (ADR 0020 §7, ADR 0026, task P13-008).
 *
 * A conversation's membership epoch is an append-only hash chain, one link per membership
 * change, exactly like {@link ../roster.ts | the device roster chain} — same shape, same
 * reasoning, different subject. The genesis link (`epoch = 1`) is unsigned and system-authored:
 * it is `CreateE2eeConversation`'s own member list, and that RPC is already an authenticated
 * call, so there is no separate signer to require. Every link after it (`epoch >= 2`) is an
 * `ADD` or `REMOVE` control event, signed by the acting member's current messaging-root private
 * key, so a node cannot originate a membership change no member requested.
 *
 * `E2eeLogicalMessage.membership_epoch` binds every payload to one of these links (ADR 0020
 * §7 "every payload binds that epoch"): a send composed against a now-superseded epoch is
 * rejected, never partially delivered under it.
 */
import { E2EE_GROUP_MAX_MEMBERS, E2eeContractError } from './modes.js';
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

export type E2eeMembershipAction = 'GENESIS' | 'ADD' | 'REMOVE';

/**
 * One link in a conversation's membership chain. `eventBytes` is the exact canonical bytes
 * `rootSignature` covers (absent for `GENESIS`, whose authenticity comes from the enclosing
 * `CreateE2eeConversation` call instead of a standalone signature); `memberActorIds` is the
 * resulting **active** roster after this link, sorted, deduplicated.
 */
export interface E2eeMembershipEventView {
  readonly conversationId: string;
  /** Starts at 1 (the unsigned genesis) and increases by exactly 1. */
  readonly epoch: bigint;
  /** All-zero at `epoch = 1`; otherwise the previous link's `digest`. */
  readonly previousDigest: Bytes;
  readonly digest: Bytes;
  readonly eventBytes: Bytes;
  readonly action: E2eeMembershipAction;
  /** The member who authored this link. For `GENESIS`, the conversation's creator. */
  readonly actorId: string;
  /** Absent for `GENESIS`; the member added or removed otherwise. */
  readonly targetActorId?: string | undefined;
  readonly memberActorIds: readonly string[];
  /** Absent for `GENESIS`. */
  readonly rootGeneration?: number | undefined;
  readonly rootSignature?: Bytes | undefined;
  readonly createdAt: Date;
}

/** The `previous_digest` of a conversation's genesis membership link: 32 zero bytes. Mirrors
 * {@link ../roster.ts#rosterGenesisPreviousDigest} for the same "typed arrays can't be frozen"
 * reason. */
export function membershipGenesisPreviousDigest(): Bytes {
  return new Uint8Array(E2EE_DIGEST_BYTES);
}

function sortedUnique(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)].sort();
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** Structural checks that hold for a membership link in isolation, before any chain comparison. */
export function assertMembershipEventShape(event: E2eeMembershipEventView): void {
  if (event.epoch < 1n) {
    throw new E2eeContractError('Membership epoch must start at 1.');
  }
  if (event.digest.length !== E2EE_DIGEST_BYTES) {
    throw new E2eeContractError(`Membership digest must be ${String(E2EE_DIGEST_BYTES)} bytes.`);
  }
  if (event.previousDigest.length !== E2EE_DIGEST_BYTES) {
    throw new E2eeContractError(
      `Membership previous digest must be ${String(E2EE_DIGEST_BYTES)} bytes.`,
    );
  }
  if (!arraysEqual([...event.memberActorIds], sortedUnique(event.memberActorIds))) {
    throw new E2eeContractError('Membership member list must be sorted and deduplicated.');
  }
  if (event.memberActorIds.length < 1 || event.memberActorIds.length > E2EE_GROUP_MAX_MEMBERS) {
    throw new E2eeContractError(
      `A conversation membership has 1..${String(E2EE_GROUP_MAX_MEMBERS)} members.`,
    );
  }

  if (event.action === 'GENESIS') {
    if (event.epoch !== 1n) {
      throw new E2eeContractError('Only epoch 1 may be the genesis membership link.');
    }
    if (!isZeroBytes(event.previousDigest)) {
      throw new E2eeContractError(
        'The genesis membership link must chain from the all-zero digest.',
      );
    }
    if (event.targetActorId !== undefined) {
      throw new E2eeContractError('The genesis membership link names no target actor.');
    }
    return;
  }

  if (event.epoch === 1n) {
    throw new E2eeContractError('Epoch 1 must be the genesis membership link.');
  }
  if (isZeroBytes(event.previousDigest)) {
    throw new E2eeContractError(
      'Only the genesis membership link may chain from the all-zero digest.',
    );
  }
  if (event.rootSignature === undefined || event.rootSignature.length !== ED25519_SIGNATURE_BYTES) {
    throw new E2eeContractError('Membership signature must be a 64-byte Ed25519 signature.');
  }
  if (event.targetActorId === undefined || event.targetActorId.length === 0) {
    throw new E2eeContractError(`A ${event.action} link must name a target actor.`);
  }
}

/**
 * Verifies that the acting member's current messaging root signed this link, and that the
 * digest is over the signed bytes. Never called for `GENESIS` — see the module doc comment.
 */
export function verifyMembershipEventSignature(
  event: E2eeMembershipEventView,
  root: E2eeIdentityRootView,
  deps: { readonly verifier: SignatureVerifier; readonly digest: DigestFunction },
): void {
  if (event.action === 'GENESIS') {
    throw new E2eeContractError('The genesis membership link is not signature-verified.');
  }
  if (event.actorId !== root.actorId) {
    throw new E2eeContractError('Membership link names a different actor than its root.');
  }
  if (event.rootGeneration !== root.generation) {
    throw new E2eeContractError('Membership link was signed by a superseded root generation.');
  }
  if (!bytesEqual(deps.digest(event.eventBytes), event.digest)) {
    throw new E2eeContractError('Membership digest does not match its transcript.');
  }
  const signature = event.rootSignature;
  if (
    signature === undefined ||
    !deps.verifier.verifyEd25519({
      publicKey: root.publicKey,
      message: event.eventBytes,
      signature,
    })
  ) {
    throw new E2eeContractError(
      'Membership link is not signed by the acting member’s messaging root.',
    );
  }
}

/**
 * The monotonicity and membership-application rule, in full. `next` must be a legal successor
 * of `previous` (or the genesis link when `previous` is `null`).
 *
 * `ADD`/`REMOVE` authorization is intentionally flat, matching this codebase's no-roles,
 * no-hierarchy stance elsewhere (spec Amendment B): any **current** active member may add a new
 * member or remove any member, including themselves (a self-remove is "leave"). ADR 0020 does
 * not specify an admin/owner concept for E2EE groups and building one is out of this task's
 * scope; this is recorded as a decision in ADR 0026.
 */
export function assertMembershipSucceeds(
  previous: E2eeMembershipEventView | null,
  next: E2eeMembershipEventView,
): void {
  assertMembershipEventShape(next);

  if (previous === null) {
    if (next.epoch !== 1n || next.action !== 'GENESIS') {
      throw new E2eeContractError('A membership chain must begin at the genesis link (epoch 1).');
    }
    return;
  }

  if (next.conversationId !== previous.conversationId) {
    throw new E2eeContractError('Membership chain switched conversations.');
  }
  if (next.epoch !== previous.epoch + 1n) {
    throw new E2eeContractError(
      `Membership epoch must advance by exactly 1 (expected ${String(previous.epoch + 1n)}, got ${String(next.epoch)}).`,
    );
  }
  if (!bytesEqual(next.previousDigest, previous.digest)) {
    throw new E2eeContractError('Membership link does not chain to the previous link’s digest.');
  }
  if (next.action === 'GENESIS') {
    throw new E2eeContractError('Only epoch 1 may be the genesis membership link.');
  }
  if (!previous.memberActorIds.includes(next.actorId)) {
    throw new E2eeContractError('Only a current active member may author a membership change.');
  }

  const target = next.targetActorId;
  if (target === undefined) {
    // Unreachable: `assertMembershipEventShape` already required a target for non-genesis links.
    throw new E2eeContractError('Membership link is missing its target actor.');
  }

  if (next.action === 'ADD') {
    if (previous.memberActorIds.includes(target)) {
      throw new E2eeContractError(`${target} is already a member.`);
    }
    const expected = sortedUnique([...previous.memberActorIds, target]);
    if (expected.length > E2EE_GROUP_MAX_MEMBERS) {
      // Callers that want a distinct "at capacity" error code (rather than a generic conflict)
      // should call `assertGroupMembershipBounds` before this function — see its doc comment.
      throw new E2eeContractError(
        `A conversation may have at most ${String(E2EE_GROUP_MAX_MEMBERS)} members.`,
      );
    }
    if (!arraysEqual(next.memberActorIds, expected)) {
      throw new E2eeContractError('Membership link’s member list does not match the applied add.');
    }
    return;
  }

  // REMOVE
  if (!previous.memberActorIds.includes(target)) {
    throw new E2eeContractError(`${target} is not a current member.`);
  }
  const expected = previous.memberActorIds.filter((id) => id !== target);
  if (expected.length < 1) {
    throw new E2eeContractError('Cannot remove the last member of a conversation.');
  }
  if (!arraysEqual(next.memberActorIds, expected)) {
    throw new E2eeContractError('Membership link’s member list does not match the applied remove.');
  }
}

/** Folds {@link assertMembershipSucceeds} across a whole chain, oldest first. */
export function assertMembershipChain(events: readonly E2eeMembershipEventView[]): void {
  let previous: E2eeMembershipEventView | null = null;
  for (const event of events) {
    assertMembershipSucceeds(previous, event);
    previous = event;
  }
}

/**
 * A dedicated pre-check for the `E2EE_GROUP_MAX_MEMBERS` boundary, so a caller can surface a
 * distinct "at capacity" error (`E2EE_GROUP_FULL`) rather than the generic membership-conflict
 * code `assertMembershipSucceeds` would otherwise throw for the same condition — the same split
 * `assertGroupFanoutBounds`/`assertFanoutCovers` uses in `envelopes.ts`.
 */
export function assertGroupMembershipBounds(nextMemberCount: number): void {
  if (nextMemberCount > E2EE_GROUP_MAX_MEMBERS) {
    throw new E2eeContractError(
      `A conversation may have at most ${String(E2EE_GROUP_MAX_MEMBERS)} members.`,
    );
  }
}
