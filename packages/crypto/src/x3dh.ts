import { ByteWriter, bytesEqual, concatBytes } from './codec.js';
import { AuthenticationError, PreKeyError } from './errors.js';
import {
  encodeCertifiedDevice,
  rosterDigest,
  verifyPreKeyBundle,
  verifyRosterSnapshot,
} from './identity.js';
import {
  generateKeyAgreementKeyPair,
  hkdfSha256,
  keyAgreement,
  sha256Hash,
  sign,
  verifyStrict,
  wipe,
} from './primitives.js';
import {
  E2EE_ALGORITHM,
  E2EE_PROTOCOL,
  E2EE_VERSION,
  KEY_BYTES,
  type CertifiedDevice,
  type DevicePrivateKeys,
  type KeyPair,
  type PreKeyBundle,
  type PrivatePreKey,
  type SignedDeviceRoster,
  type X3dhHandshake,
  type X3dhSecrets,
} from './types.js';

const TRANSCRIPT_CONTEXT = 'patches-e2ee-v1/x3dh-transcript';
const KDF_CONTEXT = 'patches-e2ee-v1/x3dh-kdf';
const X25519_F = new Uint8Array(KEY_BYTES).fill(0xff);
const ZERO_SALT = new Uint8Array(KEY_BYTES);

type UnsignedHandshake = Omit<X3dhHandshake, 'initiatorSignature'>;

function encodeUnsignedHandshake(handshake: UnsignedHandshake): Uint8Array {
  const hasOneTimePreKey =
    handshake.oneTimePreKeyId !== undefined && handshake.oneTimePreKeyPublicKey !== undefined;
  if (
    (handshake.oneTimePreKeyId === undefined) !==
    (handshake.oneTimePreKeyPublicKey === undefined)
  ) {
    throw new PreKeyError('One-time prekey id and key must be present together.');
  }
  return new ByteWriter()
    .string(TRANSCRIPT_CONTEXT)
    .string(handshake.protocol)
    .u8(handshake.version)
    .string(handshake.algorithm)
    .bytes(encodeCertifiedDevice(handshake.initiator))
    .bytes(encodeCertifiedDevice(handshake.responder))
    .fixed(handshake.initiatorRosterDigest)
    .fixed(handshake.responderRosterDigest)
    .fixed(handshake.ephemeralPublicKey)
    .u32(handshake.signedPreKeyId)
    .fixed(handshake.signedPreKeyPublicKey)
    .u8(hasOneTimePreKey ? 1 : 0)
    .fixed(
      hasOneTimePreKey ? (handshake.oneTimePreKeyPublicKey ?? new Uint8Array()) : new Uint8Array(),
    )
    .u32(hasOneTimePreKey ? (handshake.oneTimePreKeyId ?? 0) : 0)
    .finish();
}

function splitSecrets(material: Uint8Array): X3dhSecrets {
  return {
    rootKey: material.slice(0, 32),
    initiatorHeaderKey: material.slice(32, 64),
    responderHeaderKey: material.slice(64, 96),
  };
}

function deriveSecrets(
  transcript: Uint8Array,
  dh1: Uint8Array,
  dh2: Uint8Array,
  dh3: Uint8Array,
  dh4?: Uint8Array,
): X3dhSecrets {
  const input = concatBytes(X25519_F, dh1, dh2, dh3, ...(dh4 === undefined ? [] : [dh4]));
  const info = new ByteWriter()
    .string(KDF_CONTEXT)
    .string(E2EE_ALGORITHM)
    .fixed(sha256Hash(transcript))
    .finish();
  const material = hkdfSha256(input, ZERO_SALT, info, 96);
  const secrets = splitSecrets(material);
  wipe(input, material, dh1, dh2, dh3, dh4);
  return secrets;
}

function assertDeviceKeysMatch(keys: DevicePrivateKeys, device: CertifiedDevice): void {
  if (
    !bytesEqual(keys.signing.publicKey, device.certificate.signingPublicKey) ||
    !bytesEqual(keys.agreement.publicKey, device.certificate.agreementPublicKey)
  ) {
    throw new AuthenticationError();
  }
}

function rosterContains(roster: SignedDeviceRoster, device: CertifiedDevice): boolean {
  const encoded = encodeCertifiedDevice(device);
  return roster.roster.devices.some((candidate) =>
    bytesEqual(encoded, encodeCertifiedDevice(candidate)),
  );
}

export interface InitiateX3dhInput {
  readonly initiatorKeys: DevicePrivateKeys;
  readonly initiatorDevice: CertifiedDevice;
  readonly initiatorRoster: SignedDeviceRoster;
  readonly responderBundle: PreKeyBundle;
  readonly responderRoster: SignedDeviceRoster;
  readonly nowMs: number;
  /** Test-vector hook. Production callers omit this. */
  readonly ephemeralKey?: KeyPair;
}

export interface InitiateX3dhResult {
  readonly handshake: X3dhHandshake;
  readonly secrets: X3dhSecrets;
  /** Persist as the initiator's first Double Ratchet DH key. */
  readonly initiatorRatchetKey: KeyPair;
  readonly usedOneTimePreKey: boolean;
}

export function initiateX3dh(input: InitiateX3dhInput): InitiateX3dhResult {
  verifyRosterSnapshot(input.initiatorRoster, input.nowMs);
  verifyPreKeyBundle(input.responderBundle, input.responderRoster, input.nowMs);
  assertDeviceKeysMatch(input.initiatorKeys, input.initiatorDevice);
  if (!rosterContains(input.initiatorRoster, input.initiatorDevice)) {
    throw new AuthenticationError();
  }
  const ephemeral = input.ephemeralKey ?? generateKeyAgreementKeyPair();
  const bundle = input.responderBundle;
  const unsigned: UnsignedHandshake = {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    algorithm: E2EE_ALGORITHM,
    initiator: input.initiatorDevice,
    responder: bundle.certifiedDevice,
    initiatorRosterDigest: rosterDigest(input.initiatorRoster.roster),
    responderRosterDigest: bundle.rosterDigest,
    ephemeralPublicKey: ephemeral.publicKey,
    signedPreKeyId: bundle.signedPreKey.id,
    signedPreKeyPublicKey: bundle.signedPreKey.publicKey,
    ...(bundle.oneTimePreKey === undefined
      ? {}
      : {
          oneTimePreKeyId: bundle.oneTimePreKey.id,
          oneTimePreKeyPublicKey: bundle.oneTimePreKey.publicKey,
        }),
  };
  const transcript = encodeUnsignedHandshake(unsigned);
  const handshake: X3dhHandshake = {
    ...unsigned,
    initiatorSignature: sign(input.initiatorKeys.signing.privateKey, transcript),
  };
  const dh1 = keyAgreement(input.initiatorKeys.agreement.privateKey, bundle.signedPreKey.publicKey);
  const dh2 = keyAgreement(
    ephemeral.privateKey,
    bundle.certifiedDevice.certificate.agreementPublicKey,
  );
  const dh3 = keyAgreement(ephemeral.privateKey, bundle.signedPreKey.publicKey);
  const dh4 =
    bundle.oneTimePreKey === undefined
      ? undefined
      : keyAgreement(ephemeral.privateKey, bundle.oneTimePreKey.publicKey);
  return {
    handshake,
    secrets: deriveSecrets(transcript, dh1, dh2, dh3, dh4),
    initiatorRatchetKey: ephemeral,
    usedOneTimePreKey: bundle.oneTimePreKey !== undefined,
  };
}

export interface RespondX3dhInput {
  readonly responderKeys: DevicePrivateKeys;
  readonly responderBundle: PreKeyBundle;
  readonly responderRoster: SignedDeviceRoster;
  readonly initiatorRoster: SignedDeviceRoster;
  readonly signedPreKey: PrivatePreKey;
  readonly oneTimePreKey?: PrivatePreKey;
  readonly handshake: X3dhHandshake;
  readonly nowMs: number;
}

export interface RespondX3dhResult {
  readonly secrets: X3dhSecrets;
  /** Persist as the responder's initial Double Ratchet DH key. */
  readonly responderRatchetKey: KeyPair;
  readonly consumedOneTimePreKeyId?: number;
}

export function respondX3dh(input: RespondX3dhInput): RespondX3dhResult {
  verifyRosterSnapshot(input.initiatorRoster, input.nowMs);
  verifyPreKeyBundle(input.responderBundle, input.responderRoster, input.nowMs);
  assertDeviceKeysMatch(input.responderKeys, input.responderBundle.certifiedDevice);
  const handshake = input.handshake;
  if (
    handshake.protocol !== E2EE_PROTOCOL ||
    handshake.version !== E2EE_VERSION ||
    handshake.algorithm !== E2EE_ALGORITHM ||
    !bytesEqual(handshake.initiatorRosterDigest, rosterDigest(input.initiatorRoster.roster)) ||
    !bytesEqual(handshake.responderRosterDigest, input.responderBundle.rosterDigest) ||
    !bytesEqual(
      encodeCertifiedDevice(handshake.responder),
      encodeCertifiedDevice(input.responderBundle.certifiedDevice),
    ) ||
    handshake.signedPreKeyId !== input.responderBundle.signedPreKey.id ||
    !bytesEqual(handshake.signedPreKeyPublicKey, input.responderBundle.signedPreKey.publicKey) ||
    !bytesEqual(handshake.signedPreKeyPublicKey, input.signedPreKey.keyPair.publicKey) ||
    handshake.signedPreKeyId !== input.signedPreKey.id ||
    !rosterContains(input.initiatorRoster, handshake.initiator)
  ) {
    throw new AuthenticationError();
  }
  const unsigned: UnsignedHandshake = {
    protocol: handshake.protocol,
    version: handshake.version,
    algorithm: handshake.algorithm,
    initiator: handshake.initiator,
    responder: handshake.responder,
    initiatorRosterDigest: handshake.initiatorRosterDigest,
    responderRosterDigest: handshake.responderRosterDigest,
    ephemeralPublicKey: handshake.ephemeralPublicKey,
    signedPreKeyId: handshake.signedPreKeyId,
    signedPreKeyPublicKey: handshake.signedPreKeyPublicKey,
    ...(handshake.oneTimePreKeyId === undefined
      ? {}
      : {
          oneTimePreKeyId: handshake.oneTimePreKeyId,
          oneTimePreKeyPublicKey: handshake.oneTimePreKeyPublicKey,
        }),
  };
  const transcript = encodeUnsignedHandshake(unsigned);
  if (
    !verifyStrict(
      handshake.initiator.certificate.signingPublicKey,
      transcript,
      handshake.initiatorSignature,
    )
  ) {
    throw new AuthenticationError();
  }
  if (
    (handshake.oneTimePreKeyId === undefined) !== (input.oneTimePreKey === undefined) ||
    (handshake.oneTimePreKeyId === undefined) !==
      (input.responderBundle.oneTimePreKey === undefined) ||
    (input.oneTimePreKey !== undefined &&
      (handshake.oneTimePreKeyId !== input.oneTimePreKey.id ||
        handshake.oneTimePreKeyPublicKey === undefined ||
        !bytesEqual(handshake.oneTimePreKeyPublicKey, input.oneTimePreKey.keyPair.publicKey) ||
        input.responderBundle.oneTimePreKey === undefined ||
        handshake.oneTimePreKeyId !== input.responderBundle.oneTimePreKey.id ||
        !bytesEqual(
          handshake.oneTimePreKeyPublicKey,
          input.responderBundle.oneTimePreKey.publicKey,
        )))
  ) {
    throw new PreKeyError('One-time prekey was absent, mismatched, or already consumed.');
  }
  const dh1 = keyAgreement(
    input.signedPreKey.keyPair.privateKey,
    handshake.initiator.certificate.agreementPublicKey,
  );
  const dh2 = keyAgreement(input.responderKeys.agreement.privateKey, handshake.ephemeralPublicKey);
  const dh3 = keyAgreement(input.signedPreKey.keyPair.privateKey, handshake.ephemeralPublicKey);
  const dh4 =
    input.oneTimePreKey === undefined
      ? undefined
      : keyAgreement(input.oneTimePreKey.keyPair.privateKey, handshake.ephemeralPublicKey);
  return {
    secrets: deriveSecrets(transcript, dh1, dh2, dh3, dh4),
    responderRatchetKey: input.signedPreKey.keyPair,
    ...(input.oneTimePreKey === undefined
      ? {}
      : { consumedOneTimePreKeyId: input.oneTimePreKey.id }),
  };
}
