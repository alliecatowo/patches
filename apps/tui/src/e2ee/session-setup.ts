/**
 * Session bootstrap: prekey-claim → X3DH → first envelope (ADR 0020 §5, §8).
 *
 * The Double Ratchet's header-encrypted profile hides ratchet keys and counters from
 * the node *after* setup. Setup itself still has to reach the responder: which signed
 * and one-time prekeys the initiator consumed, the ephemeral public key, and the
 * initiator's transcript signature. The proto reserves `E2eeDeviceEnvelope.
 * encrypted_header` for exactly this ("for an initial (X3DH) message this carries the
 * setup header"); the concrete framing is defined here because no shared encoder exists
 * yet — a four-byte magic plus a length-prefixed setup block prepended to the ordinary
 * encrypted ratchet header, so every later message on the same session stays a bare
 * ratchet header and a receiver can tell the two apart deterministically.
 *
 * Everything cryptographic — verification, derivation, zeroization — stays inside
 * `@patches/crypto`'s reviewed `initiateX3dh`/`respondX3dh`; this module only frames
 * bytes and wires inputs into those functions.
 */
import {
  ByteReader,
  ByteWriter,
  concatBytes,
  disposeX3dhSecrets,
  initializeInitiatorRatchet,
  initializeResponderRatchet,
  initiateX3dh,
  respondX3dh,
  type CertifiedDevice,
  type DoubleRatchetState,
  type InitiateX3dhResult,
  type PreKeyBundle,
  type RespondX3dhResult,
  type SignedDeviceRoster,
  type X3dhHandshake,
} from '@patches/crypto';
import { E2eeContractError } from '@patches/domain';

import type { LocalDeviceIdentity } from './local-identity.js';

const SETUP_MAGIC = new Uint8Array([0x50, 0x45, 0x53, 0x48]); // "PESH"
const SETUP_VERSION = 1;

/** The setup block an initial envelope carries alongside its ratchet header. */
export interface InitialSetupBlock {
  readonly senderActorId: string;
  readonly senderDeviceId: string;
  readonly handshake: Omit<X3dhHandshake, 'initiator' | 'responder'>;
}

function encodeSetupBlock(identity: LocalDeviceIdentity, handshake: X3dhHandshake): Uint8Array {
  const hasOneTime = handshake.oneTimePreKeyId !== undefined;
  const writer = new ByteWriter()
    .u8(SETUP_VERSION)
    .string(identity.actorId)
    .string(identity.deviceId)
    .fixed(handshake.initiatorRosterDigest, 32)
    .fixed(handshake.responderRosterDigest, 32)
    .fixed(handshake.ephemeralPublicKey, 32)
    .u32(handshake.signedPreKeyId)
    .fixed(handshake.signedPreKeyPublicKey, 32)
    .u8(hasOneTime ? 1 : 0);
  if (hasOneTime && handshake.oneTimePreKeyPublicKey !== undefined) {
    writer.u32(handshake.oneTimePreKeyId ?? 0).fixed(handshake.oneTimePreKeyPublicKey, 32);
  }
  return writer.fixed(handshake.initiatorSignature, 64).finish();
}

function decodeSetupBlock(bytes: Uint8Array): InitialSetupBlock {
  const reader = new ByteReader(bytes);
  const version = reader.u8();
  if (version !== SETUP_VERSION) throw new E2eeContractError('Unsupported setup-header version.');
  const senderActorId = reader.string();
  const senderDeviceId = reader.string();
  const base = {
    initiatorRosterDigest: reader.fixed(32),
    responderRosterDigest: reader.fixed(32),
    ephemeralPublicKey: reader.fixed(32),
    signedPreKeyId: reader.u32(),
    signedPreKeyPublicKey: reader.fixed(32),
  };
  const hasOneTime = reader.u8() === 1;
  const oneTime = hasOneTime
    ? { oneTimePreKeyId: reader.u32(), oneTimePreKeyPublicKey: reader.fixed(32) }
    : {};
  const initiatorSignature = reader.fixed(64);
  reader.end();
  return {
    senderActorId,
    senderDeviceId,
    handshake: {
      protocol: 'patches-e2ee-v1',
      version: 1,
      algorithm: 'X25519+Ed25519+HKDF-SHA256+XChaCha20-Poly1305+DR-HE-r4',
      ...base,
      ...oneTime,
      initiatorSignature,
    },
  };
}

export function isInitialEnvelopeHeader(headerBytes: Uint8Array): boolean {
  return (
    headerBytes.length >= SETUP_MAGIC.length &&
    SETUP_MAGIC.every((byte, index) => headerBytes[index] === byte)
  );
}

/**
 * Splits an initial envelope's `encrypted_header` into the setup block and the
 * header-encrypted ratchet header it wraps. Rejects anything truncated or misframed.
 */
export function splitInitialHeader(headerBytes: Uint8Array): {
  readonly setup: InitialSetupBlock;
  readonly ratchetHeader: Uint8Array;
} {
  if (!isInitialEnvelopeHeader(headerBytes)) {
    throw new E2eeContractError('Initial header is missing its framing.');
  }
  const reader = new ByteReader(headerBytes.subarray(SETUP_MAGIC.length));
  const setupLength = reader.u32();
  const rest = headerBytes.subarray(SETUP_MAGIC.length + 4);
  if (setupLength > rest.length) throw new E2eeContractError('Initial header is truncated.');
  return {
    setup: decodeSetupBlock(rest.subarray(0, setupLength)),
    ratchetHeader: rest.slice(setupLength),
  };
}

export interface EstablishedInitiatorSession {
  readonly state: DoubleRatchetState;
  /** The framing bytes every first envelope's header is prefixed with. */
  readonly setupPrefix: Uint8Array;
  readonly usedOneTimePreKey: boolean;
}

/**
 * Runs the initiator half of X3DH against a verified peer bundle and initializes the
 * sending ratchet. `identity` supplies the local roster/certificate material
 * `initiateX3dh` authenticates with; nothing here trusts unverified input.
 */
export function establishInitiatorSession(input: {
  readonly identity: LocalDeviceIdentity;
  readonly peerBundle: PreKeyBundle;
  readonly peerRoster: SignedDeviceRoster;
  readonly nowMs: number;
}): EstablishedInitiatorSession {
  const initiated: InitiateX3dhResult = initiateX3dh({
    initiatorKeys: input.identity.keys,
    initiatorDevice: input.identity.selfDevice,
    initiatorRoster: input.identity.ownRoster,
    responderBundle: input.peerBundle,
    responderRoster: input.peerRoster,
    nowMs: input.nowMs,
  });
  // Frame the setup block BEFORE any disposal: `handshake.ephemeralPublicKey` shares
  // the buffer `disposeX3dhSecrets` zeroizes below, so encoding after disposal would
  // ship an all-zero ephemeral key.
  const setupBlock = encodeSetupBlock(input.identity, initiated.handshake);
  let state: DoubleRatchetState;
  try {
    state = initializeInitiatorRatchet(
      initiated.secrets,
      initiated.initiatorRatchetKey,
      input.peerBundle.signedPreKey.publicKey,
    );
  } finally {
    // `initializeInitiatorRatchet` cloned what it needs; dispose the rest of the derived
    // material immediately (ADR 0020 §4 hygiene).
    disposeX3dhSecrets(initiated.secrets, initiated.initiatorRatchetKey);
  }
  return {
    state,
    setupPrefix: encodeInitialFraming(setupBlock),
    usedOneTimePreKey: initiated.usedOneTimePreKey,
  };
}

function encodeInitialFraming(setupBlock: Uint8Array): Uint8Array {
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, setupBlock.length, false);
  return concatBytes(SETUP_MAGIC, length, setupBlock);
}

/**
 * Wraps a sealed initial message's ratchet header with the setup framing. Called once,
 * on the very first envelope of a session.
 */
export function withInitialFraming(setupPrefix: Uint8Array, ratchetHeader: Uint8Array): Uint8Array {
  return concatBytes(setupPrefix, ratchetHeader);
}

export interface EstablishedResponderSession {
  readonly state: DoubleRatchetState;
  readonly consumedOneTimePreKeyId?: number | undefined;
}

/**
 * Processes an incoming initial envelope: reconstructs the handshake from the verified
 * initiator roster plus the setup block, runs the responder half of X3DH against our own
 * prekey private halves, and returns the receiving ratchet ready for
 * `openDeviceEnvelope`. No state is persisted here — the caller commits only after the
 * first message authenticates (ADR 0020 §4).
 *
 * The initiator device is taken from `initiatorRoster` (already verified by the caller),
 * never from the unauthenticated setup block, which names it only so the roster entry can
 * be located.
 */
export function establishResponderSession(input: {
  readonly identity: LocalDeviceIdentity;
  readonly selfBundle: PreKeyBundle;
  readonly setup: InitialSetupBlock;
  readonly initiatorRoster: SignedDeviceRoster;
  readonly nowMs: number;
}): EstablishedResponderSession {
  const { setup } = input;
  const initiator = findRosterDevice(
    input.initiatorRoster,
    setup.senderDeviceId,
    setup.senderActorId,
  );
  if (
    setup.handshake.signedPreKeyId !== input.identity.signedPreKey.id ||
    setup.handshake.oneTimePreKeyId !== input.selfBundle.oneTimePreKey?.id
  ) {
    throw new E2eeContractError('Initial message names prekeys this device does not hold.');
  }
  const oneTime =
    setup.handshake.oneTimePreKeyId === undefined
      ? undefined
      : input.identity.oneTimePreKeys.find(
          (candidate) => candidate.id === setup.handshake.oneTimePreKeyId,
        );
  if ((oneTime === undefined) !== (setup.handshake.oneTimePreKeyId === undefined)) {
    throw new E2eeContractError('Initial message names prekeys this device does not hold.');
  }
  const handshake: X3dhHandshake = {
    ...setup.handshake,
    initiator,
    responder: input.identity.selfDevice,
  };
  const responded: RespondX3dhResult = respondX3dh({
    responderKeys: input.identity.keys,
    responderBundle: input.selfBundle,
    responderRoster: input.identity.ownRoster,
    initiatorRoster: input.initiatorRoster,
    signedPreKey: {
      id: input.identity.signedPreKey.id,
      keyPair: input.identity.signedPreKey.keyPair,
    },
    ...(oneTime === undefined
      ? {}
      : { oneTimePreKey: { id: oneTime.id, keyPair: oneTime.keyPair } }),
    handshake,
    nowMs: input.nowMs,
  });
  let state: DoubleRatchetState;
  try {
    state = initializeResponderRatchet(responded.secrets, responded.responderRatchetKey);
  } finally {
    disposeX3dhSecrets(responded.secrets);
  }
  return {
    state,
    ...(responded.consumedOneTimePreKeyId === undefined
      ? {}
      : { consumedOneTimePreKeyId: responded.consumedOneTimePreKeyId }),
  };
}

function findRosterDevice(
  roster: SignedDeviceRoster,
  deviceId: string,
  actorId: string,
): CertifiedDevice {
  const device = roster.roster.devices.find(
    (candidate) => candidate.certificate.deviceId === deviceId,
  );
  if (device === undefined || device.certificate.userId !== actorId) {
    throw new E2eeContractError('Initial message names a device absent from the verified roster.');
  }
  return device;
}
