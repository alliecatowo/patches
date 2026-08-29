/**
 * Session bootstrap: prekey-claim → X3DH → first envelope (ADR 0020 §5, §8) — web
 * port of the TUI module, byte-identical framing (both clients must recognize each
 * other's initial envelopes, so the framing is definitionally shared).
 *
 * The Double Ratchet's header-encrypted profile hides ratchet keys and counters from
 * the node *after* setup. Setup itself still has to reach the responder: which signed
 * and one-time prekeys the initiator consumed, the ephemeral public key, and the
 * initiator's transcript signature. The proto reserves `E2eeDeviceEnvelope.
 * encrypted_header` for exactly this ("for an initial (X3DH) message this carries the
 * setup header"); the concrete framing is a four-byte magic plus a length-prefixed
 * setup block prepended to the ordinary encrypted ratchet header, so every later
 * message on the same session stays a bare ratchet header and a receiver can tell the
 * two apart deterministically.
 *
 * Everything cryptographic — verification, derivation, zeroization — stays inside
 * `@patches/crypto`'s reviewed `initiateX3dh`/`respondX3dh`; this module only wires
 * inputs into those functions. Prekey ids are `u64` on the wire (ADR 0033 §2: "prekey
 * ids are u64 everywhere"), matching the X3DH handshake transcript's own encoding. The
 * setup-block framing itself (`SETUP_MAGIC`/`SETUP_VERSION`, the writer call sequence)
 * lives in `@patches/crypto`'s `setup-block.ts`, pinned by a cross-client vector
 * (ADR 0034 Stage 0(a)) — this module only translates its `MalformedInputError` into
 * this runtime's `E2eeContractError` vocabulary.
 */
import {
  concatBytes,
  disposeX3dhSecrets,
  encodeInitialFraming as cryptoEncodeInitialFraming,
  encodeSetupBlock,
  initializeInitiatorRatchet,
  initializeResponderRatchet,
  initiateX3dh,
  isInitialEnvelopeHeader as cryptoIsInitialEnvelopeHeader,
  MalformedInputError,
  respondX3dh,
  splitInitialHeader as cryptoSplitInitialHeader,
  verifyPreKeyBundle,
  type DoubleRatchetState,
  type InitialSetupBlock,
  type InitiateX3dhResult,
  type RespondX3dhResult,
  type VerifiedCertifiedDevice,
  type VerifiedPreKeyBundle,
  type VerifiedRosterSnapshot,
  type X3dhHandshake,
} from '@patches/crypto';
import { E2eeContractError } from '@patches/domain';

import {
  selfPrekeyBundle,
  type LocalDeviceIdentity,
  type LocalPreviousSignedPreKey,
} from './local-identity.js';

export type { InitialSetupBlock } from '@patches/crypto';

export function isInitialEnvelopeHeader(headerBytes: Uint8Array): boolean {
  return cryptoIsInitialEnvelopeHeader(headerBytes);
}

/**
 * Splits an initial envelope's `encrypted_header` into the setup block and the
 * header-encrypted ratchet header it wraps. Rejects anything truncated or misframed.
 */
export function splitInitialHeader(headerBytes: Uint8Array): {
  readonly setup: InitialSetupBlock;
  readonly ratchetHeader: Uint8Array;
} {
  try {
    return cryptoSplitInitialHeader(headerBytes);
  } catch (error) {
    if (error instanceof MalformedInputError) throw new E2eeContractError(error.message);
    throw error;
  }
}

export interface EstablishedInitiatorSession {
  readonly state: DoubleRatchetState;
  /** The framing bytes every first envelope's header is prefixed with. */
  readonly setupPrefix: Uint8Array;
  readonly usedOneTimePreKey: boolean;
}

function handshakeDeviceOf(device: VerifiedCertifiedDevice): {
  readonly certificateBytes: Uint8Array;
  readonly rootSignature: Uint8Array;
} {
  return { certificateBytes: device.certificateBytes, rootSignature: device.rootSignature };
}

/**
 * Runs the initiator half of X3DH against a verified peer bundle and initializes the
 * sending ratchet. `identity` supplies the local roster/certificate material
 * `initiateX3dh` authenticates with; nothing here trusts unverified input.
 */
export function establishInitiatorSession(input: {
  readonly identity: LocalDeviceIdentity;
  readonly peerBundle: VerifiedPreKeyBundle;
  readonly peerRoster: VerifiedRosterSnapshot;
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
      input.peerBundle.signedPrekeyPublicKey,
    );
  } finally {
    // `initializeInitiatorRatchet` cloned what it needs; dispose the rest of the derived
    // material immediately (ADR 0020 §4 hygiene).
    disposeX3dhSecrets(initiated.secrets, initiated.initiatorRatchetKey);
  }
  return {
    state,
    setupPrefix: cryptoEncodeInitialFraming(setupBlock),
    usedOneTimePreKey: initiated.usedOneTimePreKey,
  };
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
 * be located. `identity`'s own bundle is re-verified here (through
 * {@link selfPrekeyBundle}) for whichever one-time prekey the setup block names, rather
 * than trusted from a value the caller precomputed.
 *
 * `previousSignedPreKeys` (ADR 0020 §5, issue #278) covers the case where this device rotated
 * its signed prekey after an initiator claimed the OLD one but before their initial envelope
 * arrived — still legitimate within the mailbox's max-latency window, and refused here only once
 * `prekey-maintenance.ts` has pruned the retained key past it.
 */
export function establishResponderSession(input: {
  readonly identity: LocalDeviceIdentity;
  readonly setup: InitialSetupBlock;
  readonly initiatorRoster: VerifiedRosterSnapshot;
  readonly nowMs: number;
  readonly previousSignedPreKeys?: readonly LocalPreviousSignedPreKey[] | undefined;
}): EstablishedResponderSession {
  const { setup, identity } = input;
  const initiator = findRosterDevice(
    input.initiatorRoster,
    setup.senderDeviceId,
    setup.senderActorId,
  );
  const isCurrentSignedPreKey = setup.handshake.signedPreKeyId === identity.signedPreKey.id;
  const retainedSignedPreKey = isCurrentSignedPreKey
    ? undefined
    : (input.previousSignedPreKeys ?? []).find(
        (candidate) => candidate.id === setup.handshake.signedPreKeyId,
      );
  if (!isCurrentSignedPreKey && retainedSignedPreKey === undefined) {
    throw new E2eeContractError('Initial message names prekeys this device does not hold.');
  }
  const oneTime =
    setup.handshake.oneTimePreKeyId === undefined
      ? undefined
      : identity.oneTimePreKeys.find(
          (candidate) => candidate.id === setup.handshake.oneTimePreKeyId,
        );
  if ((oneTime === undefined) !== (setup.handshake.oneTimePreKeyId === undefined)) {
    throw new E2eeContractError('Initial message names prekeys this device does not hold.');
  }
  const oneTimeForBundle =
    oneTime === undefined ? undefined : { id: oneTime.id, publicKey: oneTime.keyPair.publicKey };
  const signedPreKeyMaterial =
    retainedSignedPreKey === undefined
      ? { id: identity.signedPreKey.id, keyPair: identity.signedPreKey.keyPair }
      : { id: retainedSignedPreKey.id, keyPair: retainedSignedPreKey.keyPair };
  const selfBundle =
    retainedSignedPreKey === undefined
      ? selfPrekeyBundle(identity, oneTimeForBundle, input.nowMs)
      : verifyPreKeyBundle({
          bundleBytes: retainedSignedPreKey.bundleBytes,
          deviceSignature: retainedSignedPreKey.deviceSignature,
          certificateBytes: identity.selfDevice.certificateBytes,
          certificateRootSignature: identity.selfDevice.rootSignature,
          ...(oneTimeForBundle === undefined ? {} : { oneTimePreKey: oneTimeForBundle }),
          roster: identity.ownRoster,
          // The retained bundle's own signed validity window, not the real wall clock: it is
          // long past its original `expiresAtMs` by the time it is retained at all (rotation
          // only happens once the *current* prekey is already due), and that gate exists to stop
          // a NEW initiator from being handed a stale bundle, not to stop this device from
          // finishing a handshake an initiator already legitimately started against it.
          nowMs: retainedSignedPreKey.createdAtMs,
        });
  const handshake: X3dhHandshake = {
    ...setup.handshake,
    initiator: handshakeDeviceOf(initiator),
    responder: handshakeDeviceOf(identity.selfDevice),
  };
  const responded: RespondX3dhResult = respondX3dh({
    responderKeys: identity.keys,
    responderBundle: selfBundle,
    responderRoster: identity.ownRoster,
    initiatorRoster: input.initiatorRoster,
    signedPreKey: signedPreKeyMaterial,
    ...(oneTime === undefined
      ? {}
      : { oneTimePreKey: { id: oneTime.id, keyPair: oneTime.keyPair } }),
    handshake,
    // The initiator is ALWAYS judged at the real clock (certificate lifetime, roster
    // membership, revocation). Only the responder's own retained bundle — whose original
    // 7-day window is long past by the time rotation retains it — is checked at the moment
    // it was still current (ADR 0020 §5 retention); see `responderBundleNowMs`.
    nowMs: input.nowMs,
    ...(retainedSignedPreKey === undefined
      ? {}
      : { responderBundleNowMs: retainedSignedPreKey.createdAtMs }),
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
  roster: VerifiedRosterSnapshot,
  deviceId: string,
  actorId: string,
): VerifiedCertifiedDevice {
  const device = roster.devices.find((candidate) => candidate.deviceId === deviceId);
  if (device === undefined || device.actorId !== actorId) {
    throw new E2eeContractError('Initial message names a device absent from the verified roster.');
  }
  return device;
}
