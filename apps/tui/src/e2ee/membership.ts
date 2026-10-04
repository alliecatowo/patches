/**
 * Client-side group membership verification (audit P2-H3).
 *
 * Before this module a sender encrypted to whatever member list `GetE2eeConversationState`
 * returned. The signed group-control transcript existed but was display-only, so a node (or a
 * database operator) that inserted a `conversation_members` row for an accomplice got every
 * later message encrypted to the accomplice's verified devices, and no client noticed.
 *
 * Now each device pins, per conversation, the last membership it verified: epoch, member set
 * and the digest of the newest signed event. Before a send:
 *
 *   - the served epoch may never go backwards;
 *   - at the same epoch the served member set and tip digest must equal the pin (this is what
 *     catches a row inserted with no signed event behind it);
 *   - at a higher epoch the signed events between the two must chain from the pinned tip,
 *     match their signed bytes, be signed by certified device keys of members, and apply
 *     legally; the result must equal the served set and tip. Then the pin advances.
 *
 * Epoch 1 (creation) has no signed event, so the first membership a device sees for a
 * conversation is trust on first use. Everything after that is derived, never taken from the
 * node. A mismatch refuses the send with a typed error; the user may explicitly accept the
 * node's current list (`acceptNodeMembership`), which is never done automatically.
 */
import { ByteReader, ByteWriter } from '@patches/crypto';
import {
  deriveGroupMembership,
  E2eeContractError,
  sameMemberSet,
  type E2eeGroupControlEventView,
  type E2eeGroupMembership,
} from '@patches/domain';
import type { E2eeGroupControlEvent } from '../api/wire/types.js';
import { E2EE_GROUP_CHANGE_KIND } from '../api/wire/enums.js';

import { groupControlEventFromWire } from './group-control.js';
import { sha256Digest, strictVerifier } from './chain.js';
import type { PeerPinVaultAccess } from './ratchet-vault.js';

export const GROUP_MEMBERSHIP_RECORD_KEY = '\0patches-e2ee-group-membership';
const RECORD_VERSION = 1;
const DIGEST_BYTES = 32;

export class MembershipMismatchError extends E2eeContractError {
  readonly conversationId: string;

  constructor(conversationId: string) {
    super(
      'The member list the node served for this conversation does not match the signed ' +
        'membership history, so nothing was sent.',
    );
    this.conversationId = conversationId;
  }
}

/** What the node serves for one conversation right now. */
export interface ServedMembership {
  readonly epoch: bigint;
  readonly memberActorIds: readonly string[];
  /** `group_control_digest`: the newest event's digest, all-zero before any transition. */
  readonly tipDigest: Uint8Array;
}

function encodePins(pins: ReadonlyMap<string, E2eeGroupMembership>): Uint8Array {
  const writer = new ByteWriter().u8(RECORD_VERSION).u32(pins.size);
  for (const [conversationId, pin] of pins) {
    writer.string(conversationId).u64(Number(pin.epoch)).fixed(pin.tipDigest, DIGEST_BYTES);
    writer.u32(pin.members.length);
    for (const member of pin.members) writer.string(member);
  }
  return writer.finish();
}

function decodePins(bytes: Uint8Array): Map<string, E2eeGroupMembership> {
  const reader = new ByteReader(bytes);
  if (reader.u8() !== RECORD_VERSION) throw new Error('Unsupported membership pin version.');
  const pins = new Map<string, E2eeGroupMembership>();
  const count = reader.u32();
  for (let index = 0; index < count; index += 1) {
    const conversationId = reader.string();
    const epoch = BigInt(reader.u64());
    const tipDigest = reader.fixed(DIGEST_BYTES);
    const members: string[] = [];
    const memberCount = reader.u32();
    for (let member = 0; member < memberCount; member += 1) members.push(reader.string());
    pins.set(conversationId, { epoch, members, tipDigest });
  }
  reader.end();
  return pins;
}

async function loadPins(vault: PeerPinVaultAccess): Promise<Map<string, E2eeGroupMembership>> {
  const bytes = await vault.getOpaqueRecord(GROUP_MEMBERSHIP_RECORD_KEY);
  if (bytes === undefined) return new Map();
  // An undecodable pin record is never read as "no pins": that would discard every check.
  return decodePins(bytes);
}

export async function loadMembershipPin(
  vault: PeerPinVaultAccess,
  conversationId: string,
): Promise<E2eeGroupMembership | undefined> {
  return (await loadPins(vault)).get(conversationId);
}

async function savePin(
  vault: PeerPinVaultAccess,
  conversationId: string,
  pin: E2eeGroupMembership,
): Promise<void> {
  const pins = await loadPins(vault);
  pins.set(conversationId, pin);
  await vault.putOpaqueRecord(GROUP_MEMBERSHIP_RECORD_KEY, encodePins(pins));
}

/** An absent digest is the genesis value: 32 zero bytes. */
function tipOf(served: ServedMembership): Uint8Array {
  return served.tipDigest.length === 0 ? new Uint8Array(DIGEST_BYTES) : served.tipDigest;
}

function fromServed(served: ServedMembership): E2eeGroupMembership {
  return {
    epoch: served.epoch,
    members: [...served.memberActorIds].sort(),
    tipDigest: tipOf(served),
  };
}

/** The user explicitly accepts the node's current member list as the new baseline. */
export async function acceptNodeMembership(
  vault: PeerPinVaultAccess,
  conversationId: string,
  served: ServedMembership,
): Promise<void> {
  await savePin(vault, conversationId, fromServed(served));
}

export interface VerifyMembershipInput {
  readonly vault: PeerPinVaultAccess;
  readonly conversationId: string;
  readonly served: ServedMembership;
  /** Signed events with epoch greater than `afterEpoch`, ascending, as the node serves them. */
  readonly listEvents: (afterEpoch: bigint) => Promise<readonly E2eeGroupControlEvent[]>;
  /** The CERTIFIED signing key of `actorId`'s active device `deviceId`, or `undefined`. */
  readonly signerKey: (actorId: string, deviceId: string) => Promise<Uint8Array | undefined>;
}

function viewOf(wire: E2eeGroupControlEvent): E2eeGroupControlEventView {
  const change =
    wire.change === E2EE_GROUP_CHANGE_KIND.ADDED
      ? 'ADDED'
      : wire.change === E2EE_GROUP_CHANGE_KIND.REMOVED
        ? 'REMOVED'
        : undefined;
  if (change === undefined) throw new E2eeContractError('Unknown group-control change kind.');
  return groupControlEventFromWire(wire, change);
}

/**
 * Throws `MembershipMismatchError` unless the served membership is consistent with what this
 * device verified. First sight of a conversation is pinned (TOFU). Network failures propagate
 * unchanged: a send that cannot be verified does not happen, but it is not reported as an
 * attack.
 */
export async function verifyConversationMembership(input: VerifyMembershipInput): Promise<void> {
  const { vault, conversationId, served } = input;
  const pin = await loadMembershipPin(vault, conversationId);
  if (pin === undefined) {
    await savePin(vault, conversationId, fromServed(served));
    return;
  }
  const mismatch = (): MembershipMismatchError => new MembershipMismatchError(conversationId);
  if (served.epoch < pin.epoch) throw mismatch();
  if (served.epoch === pin.epoch) {
    const same =
      sameMemberSet(served.memberActorIds, pin.members) &&
      tipOf(served).every((byte, index) => byte === pin.tipDigest[index]);
    if (!same) throw mismatch();
    return;
  }

  const wireEvents = await input.listEvents(pin.epoch);
  let views: E2eeGroupControlEventView[];
  try {
    views = wireEvents
      .map(viewOf)
      .filter((event) => event.epoch > pin.epoch && event.epoch <= served.epoch);
  } catch {
    throw mismatch();
  }
  const keys = new Map<string, Uint8Array>();
  for (const event of views) {
    const id = `${event.signerActorId}\u0000${event.signerDeviceId}`;
    if (keys.has(id)) continue;
    const key = await input.signerKey(event.signerActorId, event.signerDeviceId);
    if (key !== undefined) keys.set(id, key);
  }
  let derived: E2eeGroupMembership;
  try {
    derived = deriveGroupMembership({
      from: pin,
      events: views,
      signerKeyFor: (event) => keys.get(`${event.signerActorId}\u0000${event.signerDeviceId}`),
      deps: { verifier: strictVerifier, digest: sha256Digest },
    });
  } catch {
    throw mismatch();
  }
  if (
    derived.epoch !== served.epoch ||
    !sameMemberSet(derived.members, served.memberActorIds) ||
    !derived.tipDigest.every((byte, index) => byte === tipOf(served)[index])
  ) {
    throw mismatch();
  }
  await savePin(vault, conversationId, derived);
}
