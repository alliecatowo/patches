import { ByteWriter, bytesEqual, concatBytes } from './codec.js';
import { AuthenticationError, PreKeyError } from './errors.js';
import {
  rosterHasActiveCertificate,
  type VerifiedCertifiedDevice,
  type VerifiedPreKeyBundle,
  type VerifiedRosterSnapshot,
} from './identity.js';
import {
  generateKeyAgreementKeyPair,
  hkdfSha256,
  keyAgreement,
  sha256Hash,
  sign,
  verifyStrict,
} from './primitives.js';
import {
  E2EE_ALGORITHM,
  E2EE_PROTOCOL,
  E2EE_VERSION,
  KEY_BYTES,
  SIGNATURE_BYTES,
  type DevicePrivateKeys,
  type HandshakeCertifiedDevice,
  type KeyPair,
  type PrivatePreKey,
  type X3dhHandshake,
  type X3dhSecrets,
} from './types.js';
import { zeroize } from './zeroize.js';

const TRANSCRIPT_CONTEXT = 'patches-e2ee-v1/x3dh-transcript';
const KDF_CONTEXT = 'patches-e2ee-v1/x3dh-kdf';
const X25519_F = new Uint8Array(KEY_BYTES).fill(0xff);
const ZERO_SALT = new Uint8Array(KEY_BYTES);

type UnsignedHandshake = Omit<X3dhHandshake, 'initiatorSignature'>;

function writeCertifiedDevice(writer: ByteWriter, device: HandshakeCertifiedDevice): ByteWriter {
  return writer.bytes(device.certificateBytes).fixed(device.rootSignature, SIGNATURE_BYTES);
}

function encodeUnsignedHandshake(handshake: UnsignedHandshake): Uint8Array {
  const hasOneTimePreKey =
    handshake.oneTimePreKeyId !== undefined && handshake.oneTimePreKeyPublicKey !== undefined;
  if (
    (handshake.oneTimePreKeyId === undefined) !==
    (handshake.oneTimePreKeyPublicKey === undefined)
  ) {
    throw new PreKeyError('One-time prekey id and key must be present together.');
  }
  const writer = new ByteWriter()
    .string(TRANSCRIPT_CONTEXT)
    .string(handshake.protocol)
    .u8(handshake.version)
    .string(handshake.algorithm);
  writeCertifiedDevice(writer, handshake.initiator);
  writeCertifiedDevice(writer, handshake.responder);
  writer
    .fixed(handshake.initiatorRosterDigest, KEY_BYTES)
    .fixed(handshake.responderRosterDigest, KEY_BYTES)
    .fixed(handshake.ephemeralPublicKey, KEY_BYTES)
    .u64(handshake.signedPreKeyId)
    .fixed(handshake.signedPreKeyPublicKey, KEY_BYTES)
    .u8(hasOneTimePreKey ? 1 : 0);
  // The presence flag above already distinguishes "no one-time prekey" from "one present"; a
  // fixed-width write only happens when there is a key to write, so the field stays exactly
  // `KEY_BYTES` whenever it appears rather than a variable-width write the flag would have to
  // disambiguate a second time.
  if (hasOneTimePreKey && handshake.oneTimePreKeyPublicKey !== undefined) {
    writer.fixed(handshake.oneTimePreKeyPublicKey, KEY_BYTES);
  }
  return writer.u64(hasOneTimePreKey ? (handshake.oneTimePreKeyId ?? 0) : 0).finish();
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
    .fixed(sha256Hash(transcript), KEY_BYTES)
    .finish();
  const material = hkdfSha256(input, ZERO_SALT, info, 96);
  const secrets = splitSecrets(material);
  zeroize(input, material, dh1, dh2, dh3, dh4);
  return secrets;
}

function assertDeviceKeysMatch(keys: DevicePrivateKeys, device: VerifiedCertifiedDevice): void {
  if (
    !bytesEqual(keys.signing.publicKey, device.signingPublicKey) ||
    !bytesEqual(keys.agreement.publicKey, device.agreementPublicKey)
  ) {
    throw new AuthenticationError();
  }
}

/**
 * Branding is a type-level property, so it is backed by a runtime one: a `Verified*` value proves
 * its signatures were checked over the bytes it carries, but not that it is still within its
 * validity window at *this* `nowMs`, nor that two separately verified objects belong together.
 */
function assertCurrentlyValid(nowMs: number, createdAtMs: number, expiresAtMs: number): void {
  if (nowMs < createdAtMs || nowMs >= expiresAtMs) throw new AuthenticationError();
}

function assertActiveMember(
  roster: VerifiedRosterSnapshot,
  device: VerifiedCertifiedDevice,
  nowMs: number,
): void {
  if (
    device.actorId !== roster.actorId ||
    !bytesEqual(device.rootPublicKey, roster.rootPublicKey) ||
    !rosterHasActiveCertificate(roster, device.certificateDigest) ||
    nowMs < roster.createdAtMs
  ) {
    throw new AuthenticationError();
  }
  assertCurrentlyValid(nowMs, device.createdAtMs, device.expiresAtMs);
}

function assertBundleMatchesRoster(
  bundle: VerifiedPreKeyBundle,
  roster: VerifiedRosterSnapshot,
  nowMs: number,
): void {
  if (!bytesEqual(bundle.rosterDigest, roster.rosterDigest)) throw new AuthenticationError();
  assertActiveMember(roster, bundle.device, nowMs);
  assertCurrentlyValid(nowMs, bundle.createdAtMs, bundle.expiresAtMs);
}

function handshakeDevice(device: VerifiedCertifiedDevice): HandshakeCertifiedDevice {
  return { certificateBytes: device.certificateBytes, rootSignature: device.rootSignature };
}

function sameHandshakeDevice(
  left: HandshakeCertifiedDevice,
  right: HandshakeCertifiedDevice,
): boolean {
  return (
    bytesEqual(left.certificateBytes, right.certificateBytes) &&
    bytesEqual(left.rootSignature, right.rootSignature)
  );
}

export interface InitiateX3dhInput {
  readonly initiatorKeys: DevicePrivateKeys;
  readonly initiatorDevice: VerifiedCertifiedDevice;
  readonly initiatorRoster: VerifiedRosterSnapshot;
  readonly responderBundle: VerifiedPreKeyBundle;
  readonly responderRoster: VerifiedRosterSnapshot;
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
  assertDeviceKeysMatch(input.initiatorKeys, input.initiatorDevice);
  assertActiveMember(input.initiatorRoster, input.initiatorDevice, input.nowMs);
  assertBundleMatchesRoster(input.responderBundle, input.responderRoster, input.nowMs);
  const ephemeral = input.ephemeralKey ?? generateKeyAgreementKeyPair();
  const bundle = input.responderBundle;
  const unsigned: UnsignedHandshake = {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    algorithm: E2EE_ALGORITHM,
    initiator: handshakeDevice(input.initiatorDevice),
    responder: handshakeDevice(bundle.device),
    // The roster digests both sides bind are the ones each verifier computed itself over the
    // served roster bytes, never a node-supplied convenience field (ADR 0033 §2).
    initiatorRosterDigest: input.initiatorRoster.rosterDigest,
    responderRosterDigest: input.responderRoster.rosterDigest,
    ephemeralPublicKey: ephemeral.publicKey,
    signedPreKeyId: bundle.signedPrekeyId,
    signedPreKeyPublicKey: bundle.signedPrekeyPublicKey,
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
  const dh1 = keyAgreement(input.initiatorKeys.agreement.privateKey, bundle.signedPrekeyPublicKey);
  const dh2 = keyAgreement(ephemeral.privateKey, bundle.device.agreementPublicKey);
  const dh3 = keyAgreement(ephemeral.privateKey, bundle.signedPrekeyPublicKey);
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
  readonly responderBundle: VerifiedPreKeyBundle;
  readonly responderRoster: VerifiedRosterSnapshot;
  readonly initiatorRoster: VerifiedRosterSnapshot;
  readonly signedPreKey: PrivatePreKey;
  readonly oneTimePreKey?: PrivatePreKey;
  readonly handshake: X3dhHandshake;
  readonly nowMs: number;
  /**
   * Clock used ONLY for the responder's own bundle validity window. A responder answering an
   * initial message sealed against a signed prekey it has since rotated out (ADR 0020 §5: the
   * previous private key is retained for the 30-day mailbox window) presents that retained
   * bundle, whose original 7-day window is long past. Backdating this one check is what lets
   * the handshake finish; everything about the *initiator* (certificate lifetime, roster
   * membership, revocation) is still judged at `nowMs`, never at a past instant.
   */
  readonly responderBundleNowMs?: number;
}

export interface RespondX3dhResult {
  readonly secrets: X3dhSecrets;
  /** Persist as the responder's initial Double Ratchet DH key. */
  readonly responderRatchetKey: KeyPair;
  readonly consumedOneTimePreKeyId?: number;
}

/**
 * Best-effort zeroization of the X3DH setup material once both ratchets are initialized: the
 * secrets (the initialized ratchet holds its own `.slice()`d copies, so the originals have no
 * further use) and, on the initiator, the ephemeral ratchet key pair whose private half must not
 * linger beside the persisted session. Call on every path that finishes setup — success and
 * failure alike — after `initializeInitiatorRatchet`/`initializeResponderRatchet` have cloned what
 * they need. The ephemeral argument is only ever the initiator's generated pair; a responder's
 * signed prekey object is owned by its inventory and is never passed here.
 */
export function disposeX3dhSecrets(secrets: X3dhSecrets, initiatorEphemeral?: KeyPair): void {
  zeroize(
    secrets.rootKey,
    secrets.initiatorHeaderKey,
    secrets.responderHeaderKey,
    initiatorEphemeral?.privateKey,
    initiatorEphemeral?.publicKey,
  );
}

export function respondX3dh(input: RespondX3dhInput): RespondX3dhResult {
  assertDeviceKeysMatch(input.responderKeys, input.responderBundle.device);
  assertBundleMatchesRoster(
    input.responderBundle,
    input.responderRoster,
    input.responderBundleNowMs ?? input.nowMs,
  );
  const handshake = input.handshake;
  const bundle = input.responderBundle;
  if (
    handshake.protocol !== E2EE_PROTOCOL ||
    handshake.version !== E2EE_VERSION ||
    handshake.algorithm !== E2EE_ALGORITHM ||
    !bytesEqual(handshake.initiatorRosterDigest, input.initiatorRoster.rosterDigest) ||
    !bytesEqual(handshake.responderRosterDigest, input.responderRoster.rosterDigest) ||
    !sameHandshakeDevice(handshake.responder, handshakeDevice(bundle.device)) ||
    handshake.signedPreKeyId !== bundle.signedPrekeyId ||
    !bytesEqual(handshake.signedPreKeyPublicKey, bundle.signedPrekeyPublicKey) ||
    !bytesEqual(handshake.signedPreKeyPublicKey, input.signedPreKey.keyPair.publicKey) ||
    handshake.signedPreKeyId !== input.signedPreKey.id
  ) {
    throw new AuthenticationError();
  }
  // The initiator's certificate is only trusted because it is one of the certificates the
  // initiator's roster snapshot was verified against — a `Verified*` value cannot exist without
  // its signature having been checked, so no signature is re-verified here.
  const initiator = input.initiatorRoster.devices.find((candidate) =>
    sameHandshakeDevice(handshakeDevice(candidate), handshake.initiator),
  );
  if (initiator === undefined) throw new AuthenticationError();
  assertActiveMember(input.initiatorRoster, initiator, input.nowMs);

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
  if (!verifyStrict(initiator.signingPublicKey, transcript, handshake.initiatorSignature)) {
    throw new AuthenticationError();
  }
  if (
    (handshake.oneTimePreKeyId === undefined) !== (input.oneTimePreKey === undefined) ||
    (handshake.oneTimePreKeyId === undefined) !== (bundle.oneTimePreKey === undefined) ||
    (input.oneTimePreKey !== undefined &&
      (handshake.oneTimePreKeyId !== input.oneTimePreKey.id ||
        handshake.oneTimePreKeyPublicKey === undefined ||
        !bytesEqual(handshake.oneTimePreKeyPublicKey, input.oneTimePreKey.keyPair.publicKey) ||
        bundle.oneTimePreKey === undefined ||
        handshake.oneTimePreKeyId !== bundle.oneTimePreKey.id ||
        !bytesEqual(handshake.oneTimePreKeyPublicKey, bundle.oneTimePreKey.publicKey)))
  ) {
    throw new PreKeyError('One-time prekey was absent, mismatched, or already consumed.');
  }
  const dh1 = keyAgreement(input.signedPreKey.keyPair.privateKey, initiator.agreementPublicKey);
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
