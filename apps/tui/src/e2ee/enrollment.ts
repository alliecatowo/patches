/**
 * Device enrollment (B-107, ADR 0020 §2–§3): turns this installation into a real,
 * locally-held messaging device so the B-101 runtime stops running identity-less.
 *
 * The flow, in order — every step fails closed, never a half-trusted state:
 *
 *   1. Preflight against `GetE2eeCapability` (rollout state + protocol versions). A
 *      first device bootstraps the account root here (`PublishIdentityRoot`, generation
 *      1); an account that already publishes a root this machine does not hold is
 *      refused honestly — adopting or linking an existing authority key is recovery
 *      work, not enrollment (ADR 0020 §2: ordinary devices never receive the root
 *      private key; the root lives in this vault per the recovery design).
 *   2. Generate this device's Ed25519 signing + X25519 agreement keypairs, then sign
 *      BOTH transcript families from the same keys: the crypto-native encodings
 *      `@patches/crypto`'s X3DH verifies locally (`LocalDeviceIdentity`), and the
 *      node-canonical transcripts the node stores and serves (`node-transcripts.ts`).
 *      Two encoders, one key set — the split is documented in the server codec's
 *      header; hoisting it into `@patches/domain` is the tracked follow-up that would
 *      remove it (packages are read-only in this change).
 *   3. Persist EVERYTHING through the encrypted vault BEFORE any bytes reach the node
 *      (ADR 0020 §4's commit-before-network rule, applied to identity): the node must
 *      never hold keys this device could lose to a crash. A stored record whose
 *      submission never completed resumes verbatim on the next attempt.
 *   4. Call `EnrollDevice` with certificate + signed roster + signed prekey bundle +
 *      one-time prekeys. Success flips the runtime's `enrolled()` true via the shell,
 *      and every peer's next roster check sees the bump — which is why the screens
 *      surface ADR 0020 §3's visible-security-event warning alongside the result.
 *
 * Hard rules carried over from the runtime (ADR 0020 §4 / spec §194): no key material
 * or transcript bytes ever reach an error message or log line; user-facing copy is fixed.
 */
import { create } from '@bufbuild/protobuf';
import {
  E2eeIdentityRootSchema,
  EnrollDeviceRequestSchema,
  PublishIdentityRootRequestSchema,
} from '@patches/proto/es';
import {
  sha256Hash,
  sign,
  signDeviceRoster,
  zeroize,
  ByteReader,
  ByteWriter,
  E2EE_PROTOCOL,
  E2EE_VERSION,
  KEY_BYTES,
  certifyDevice,
  createSignedPreKey,
  generateKeyAgreementKeyPair,
  generateSigningKeyPair,
  randomBytes,
  rosterDigest,
  type CertifiedDevice,
  type DeviceCertificate,
  type DeviceRoster,
  type KeyPair,
} from '@patches/crypto';
import { E2EE_ONE_TIME_PREKEY_TARGET, E2EE_PROTOCOL_V1 } from '@patches/domain';

import { fromDate } from '../api/wire/time.js';
import { E2EE_DEVICE_STATUS } from '../api/wire/enums.js';
import type {
  EnrollDeviceRequest,
  E2eeIdentityRoot,
  PublishIdentityRootRequest,
} from '../api/wire/types.js';
import type { LocalDeviceIdentity } from './local-identity.js';
import type { RatchetSessionVault } from './ratchet-vault.js';
import {
  encodeCertificateTranscript,
  encodePrekeyBundleTranscript,
  encodeRosterTranscript,
} from './node-transcripts.js';

/** Certificate validity window (ADR 0020 §2 leaves the cadence to clients; 30 days keeps
 * renewal a routine, root-signed roster bump rather than an identity event). */
const CERTIFICATE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
/** Signed-prekey rotation window (ADR 0020 §5: seven days). */
const SIGNED_PREKEY_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
/** One-time prekeys created at enrollment; `UploadPrekeys` replenishes later (B-107 left). */
const INITIAL_ONE_TIME_PREKEY_COUNT = E2EE_ONE_TIME_PREKEY_TARGET;

// ---------------------------------------------------------------------------
// User copy — fixed strings only (no key material can ever parameterize these)
// ---------------------------------------------------------------------------

export const ENROLLMENT_REFUSAL_COPY = {
  capabilityOff:
    'This node has not enabled end-to-end encrypted messaging, so no device can be enrolled here.',
  remoteRoot:
    'This account already has a messaging identity published from another device, and this ' +
    'computer does not hold its authority key. Linking an existing identity is not available ' +
    'yet — enroll from the device that set it up.',
} as const;

/** ADR 0020 §3: adding a certified device is a visible security event for peers — shown
 * on the enrollment result, not buried in help. */
export const ENROLLMENT_PEER_WARNING_COPY =
  'Your enrolled-device list changed. People you chat with will see a new-device security ' +
  'notice on their next check; your safety number with them does not change. If you did not ' +
  'just approve this on purpose, revoke the device now (:devices).';

// ---------------------------------------------------------------------------
// Enrollment transport seam — implemented by the shell over `PatchesApi`
// ---------------------------------------------------------------------------

/** Structural capability view the flow needs (mirrors `GetE2eeCapabilityResponse`). */
export interface EnrollmentCapability {
  readonly state: number;
  readonly supportedProtocolVersions: readonly string[];
}

export interface EnrollmentTransport {
  getCapability(): Promise<EnrollmentCapability | undefined>;
  /** The account's current published root, or `undefined` when there is none yet. */
  getIdentityRoot(actorId: string): Promise<E2eeIdentityRoot | undefined>;
  publishIdentityRoot(request: PublishIdentityRootRequest): Promise<unknown>;
  enrollDevice(request: EnrollDeviceRequest): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Stored record — everything needed to resume, re-submit, and run the runtime
// ---------------------------------------------------------------------------

/** Reserved vault record key. The leading `\u0000` cannot occur in a real session id
 * (`sessionIdFor` composes UUID conversation ids), so the runtime can never collide. */
export const ENROLLMENT_RECORD_KEY = '\u0000patches-e2ee-enrollment';

/** Node-canonical material submitted to `EnrollDevice` (kept for verbatim resubmission). */
export interface SubmittedWireMaterial {
  readonly certificateBytes: Uint8Array;
  readonly certificateRootSignature: Uint8Array;
  readonly rosterSequence: bigint;
  readonly rosterBytes: Uint8Array;
  readonly rosterDigestValue: Uint8Array;
  readonly rosterRootSignature: Uint8Array;
  readonly addedAtMs: number;
  readonly signedPrekeyId: number;
  readonly bundleBytes: Uint8Array;
  readonly bundleSignature: Uint8Array;
}

export interface StoredEnrollment {
  /** True once `EnrollDevice` resolved successfully at least once. */
  readonly submitted: boolean;
  /** True when this device bootstrapped the account root (`PublishIdentityRoot` gen 1). */
  readonly createdRoot: boolean;
  readonly rootPrivate: Uint8Array;
  readonly rootPublic: Uint8Array;
  readonly rootGeneration: number;
  readonly identity: LocalDeviceIdentity;
  readonly wire: SubmittedWireMaterial;
}

function writeKey(writer: ByteWriter, key: KeyPair): void {
  writer.fixed(key.privateKey, KEY_BYTES).fixed(key.publicKey, KEY_BYTES);
}

function readKey(reader: ByteReader): KeyPair {
  return { privateKey: reader.fixed(KEY_BYTES), publicKey: reader.fixed(KEY_BYTES) };
}

function writeBytes(writer: ByteWriter, value: Uint8Array): void {
  // `ByteWriter#bytes` writes a u32 length prefix; `readLengthPrefixed` mirrors it.
  writer.bytes(value);
}

function readLengthPrefixed(reader: ByteReader): Uint8Array {
  return reader.bytes();
}

function u64ToBigEndian(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new Error('u64 out of range.');
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, false);
  return out;
}

function u64FromBigEndian(bytes: Uint8Array): bigint {
  return new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, false);
}

export function encodeStoredEnrollment(record: StoredEnrollment): Uint8Array {
  const certificate = record.identity.selfDevice.certificate;
  const writer = new ByteWriter()
    .u8(1)
    .u8(record.submitted ? 1 : 0)
    .u8(record.createdRoot ? 1 : 0)
    .fixed(record.rootPrivate, KEY_BYTES)
    .fixed(record.rootPublic, KEY_BYTES)
    .u32(record.rootGeneration)
    .string(record.identity.actorId)
    .string(record.identity.deviceId);
  writeKey(writer, record.identity.keys.signing);
  writeKey(writer, record.identity.keys.agreement);
  writer.u32(certificate.generation);
  writer.u64(certificate.createdAtMs).u64(certificate.expiresAtMs);
  writeBytes(writer, record.identity.selfDevice.rootSignature);
  writeBytes(writer, record.identity.ownRoster.rootSignature);
  writer.u64(record.identity.ownRoster.roster.createdAtMs);
  writer.u32(record.identity.signedPreKey.id);
  writeKey(writer, record.identity.signedPreKey.keyPair);
  writer
    .u64(record.identity.signedPreKey.createdAtMs)
    .u64(record.identity.signedPreKey.expiresAtMs);
  writeBytes(writer, record.identity.signedPreKey.signature);
  writer.u32(record.identity.oneTimePreKeys.length);
  for (const prekey of record.identity.oneTimePreKeys) {
    writer.u32(prekey.id);
    writeKey(writer, prekey.keyPair);
  }
  writeBytes(writer, record.wire.certificateBytes);
  writeBytes(writer, record.wire.certificateRootSignature);
  writeBytes(writer, u64ToBigEndian(record.wire.rosterSequence));
  writeBytes(writer, record.wire.rosterBytes);
  writeBytes(writer, record.wire.rosterDigestValue);
  writeBytes(writer, record.wire.rosterRootSignature);
  writer.u64(record.wire.addedAtMs);
  writer.u32(record.wire.signedPrekeyId);
  writeBytes(writer, record.wire.bundleBytes);
  writeBytes(writer, record.wire.bundleSignature);
  return writer.finish();
}

export function decodeStoredEnrollment(bytes: Uint8Array): StoredEnrollment {
  const reader = new ByteReader(bytes);
  const version = reader.u8();
  if (version !== 1) throw new Error('Unsupported enrollment record version.');
  const submitted = reader.u8() === 1;
  const createdRoot = reader.u8() === 1;
  const rootPrivate = reader.fixed(KEY_BYTES);
  const rootPublic = reader.fixed(KEY_BYTES);
  const rootGeneration = reader.u32();
  const actorId = reader.string();
  const deviceId = reader.string();
  const signing = readKey(reader);
  const agreement = readKey(reader);
  const generation = reader.u32();
  const createdAtMs = reader.u64();
  const expiresAtMs = reader.u64();
  const selfRootSignature = readLengthPrefixed(reader);
  const ownRosterRootSignature = readLengthPrefixed(reader);
  const rosterCreatedAtMs = reader.u64();

  // Enrollment always creates sequence 1 with only this device listed; later rosters
  // belong to rotation/revocation flows, not to this record's shape.
  const cryptoCertificate: DeviceCertificate = {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    userId: actorId,
    deviceId,
    signingPublicKey: signing.publicKey,
    agreementPublicKey: agreement.publicKey,
    generation,
    createdAtMs,
    expiresAtMs,
  };
  const selfDevice: CertifiedDevice = {
    certificate: cryptoCertificate,
    rootSignature: selfRootSignature,
  };
  const ownRosterObject: DeviceRoster = {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    userId: actorId,
    rootPublicKey: rootPublic,
    sequence: 1,
    previousDigest: new Uint8Array(KEY_BYTES),
    devices: [selfDevice],
    createdAtMs: rosterCreatedAtMs,
  };

  const signedPreKeyId = reader.u32();
  const signedPreKeyPair = readKey(reader);
  const signedPreKeyCreatedAtMs = reader.u64();
  const signedPreKeyExpiresAtMs = reader.u64();
  const signedPreKeySignature = readLengthPrefixed(reader);
  const oneTimeCount = reader.u32();
  const oneTimePreKeys: { id: number; keyPair: KeyPair }[] = [];
  for (let index = 0; index < oneTimeCount; index += 1) {
    const id = reader.u32();
    oneTimePreKeys.push({ id, keyPair: readKey(reader) });
  }
  const wire: SubmittedWireMaterial = {
    certificateBytes: readLengthPrefixed(reader),
    certificateRootSignature: readLengthPrefixed(reader),
    rosterSequence: u64FromBigEndian(readLengthPrefixed(reader)),
    rosterBytes: readLengthPrefixed(reader),
    rosterDigestValue: readLengthPrefixed(reader),
    rosterRootSignature: readLengthPrefixed(reader),
    addedAtMs: reader.u64(),
    signedPrekeyId: reader.u32(),
    bundleBytes: readLengthPrefixed(reader),
    bundleSignature: readLengthPrefixed(reader),
  };
  reader.end();
  return {
    submitted,
    createdRoot,
    rootPrivate,
    rootPublic,
    rootGeneration,
    identity: {
      actorId,
      deviceId,
      keys: { signing, agreement },
      selfDevice,
      ownRoster: { roster: ownRosterObject, rootSignature: ownRosterRootSignature },
      signedPreKey: {
        id: signedPreKeyId,
        keyPair: signedPreKeyPair,
        createdAtMs: signedPreKeyCreatedAtMs,
        expiresAtMs: signedPreKeyExpiresAtMs,
        signature: signedPreKeySignature,
      },
      oneTimePreKeys,
    },
    wire,
  };
}

// ---------------------------------------------------------------------------
// Material generation (pure aside from randomness; injectable clock for tests)
// ---------------------------------------------------------------------------

export interface GenerateEnrollmentInput {
  readonly actorId: string;
  /** Present when resuming around an existing authority; absent on first-device bootstrap. */
  readonly root?: { readonly privateKey: Uint8Array; readonly publicKey: Uint8Array };
  readonly nowMs: number;
}

export interface GeneratedEnrollment {
  readonly record: StoredEnrollment;
  readonly publishRootRequest: PublishIdentityRootRequest | undefined;
  readonly enrollRequest: EnrollDeviceRequest;
}

function randomDeviceId(): string {
  // UUID-shaped per the node's DEVICE_ID_PATTERN (`[0-9a-f-]{8,64}`); random per ADR
  // 0020 §2 ("not derived from hardware, an account id, or a key").
  const hex: string[] = [];
  for (const byte of randomBytes(16)) hex.push(byte.toString(16).padStart(2, '0'));
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 32)}`;
}

/**
 * Builds one complete enrollment: keypairs, both transcript families' signatures, the
 * prekey inventory, and the two wire requests. Every produced claim is re-verified by
 * the tests against `@patches/crypto`'s strict verifiers and the node-canonical decoders.
 */
export function generateEnrollment(input: GenerateEnrollmentInput): GeneratedEnrollment {
  const bootstrap = input.root === undefined;
  const rootKeys =
    input.root ??
    (() => {
      const generated = generateSigningKeyPair();
      return { privateKey: generated.privateKey, publicKey: generated.publicKey };
    })();

  const signing = generateSigningKeyPair();
  const agreement = generateKeyAgreementKeyPair();
  const deviceId = randomDeviceId();
  const createdAtMs = Math.max(0, input.nowMs - 1000);
  const expiresAtMs = createdAtMs + CERTIFICATE_LIFETIME_MS;

  // --- crypto-native family (what X3DH verifies locally) ---------------------
  const cryptoCertificate: DeviceCertificate = {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    userId: input.actorId,
    deviceId,
    signingPublicKey: signing.publicKey,
    agreementPublicKey: agreement.publicKey,
    generation: 1,
    createdAtMs,
    expiresAtMs,
  };
  const selfDevice = certifyDevice(rootKeys.privateKey, cryptoCertificate);
  const ownRoster = signDeviceRoster(rootKeys.privateKey, {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    userId: input.actorId,
    rootPublicKey: rootKeys.publicKey,
    sequence: 1,
    previousDigest: new Uint8Array(KEY_BYTES),
    devices: [selfDevice],
    createdAtMs,
  });
  const ownDigest = rosterDigest(ownRoster.roster);

  // --- node-canonical family (what the node stores, serves, and verifies) ----
  const supportedVersions = [E2EE_PROTOCOL_V1];
  const certificateBytes = encodeCertificateTranscript({
    actorId: input.actorId,
    deviceId,
    rootGeneration: 1,
    certificateVersion: 1,
    signingPublicKey: signing.publicKey,
    agreementPublicKey: agreement.publicKey,
    supportedProtocolVersions: supportedVersions,
    createdAtMs,
    expiresAtMs,
  });
  const certificateRootSignature = sign(rootKeys.privateKey, certificateBytes);
  const certificateDigest = sha256Hash(certificateBytes);

  const addedAtMs = createdAtMs;
  const rosterBytes = encodeRosterTranscript({
    actorId: input.actorId,
    sequence: 1n,
    rootGeneration: 1,
    previousDigest: new Uint8Array(KEY_BYTES),
    entries: [{ deviceId, certificateDigest, active: true, addedAtMs }],
  });
  const rosterRootSignature = sign(rootKeys.privateKey, rosterBytes);
  const rosterDigestValue = sha256Hash(rosterBytes);

  // Signed prekey: one X25519 pair, TWO statements — the crypto-native statement for
  // local bundle verification, the node-canonical statement for the wire. Both are made
  // by the device signing key over their respective canonical encodings.
  const signedPreKeyId = 1;
  const signedPreKeyPair = generateKeyAgreementKeyPair();
  const signedPreKeyExpiresAtMs = createdAtMs + SIGNED_PREKEY_LIFETIME_MS;
  const cryptoSignedPreKey = createSignedPreKey(signing.privateKey, selfDevice, ownDigest, {
    id: signedPreKeyId,
    publicKey: signedPreKeyPair.publicKey,
    createdAtMs,
    expiresAtMs: signedPreKeyExpiresAtMs,
  });
  const bundleBytes = encodePrekeyBundleTranscript({
    certificateDigest,
    agreementPublicKey: agreement.publicKey,
    protocolVersion: '',
    actorId: input.actorId,
    deviceId,
    signedPrekeyId: signedPreKeyId,
    signedPrekeyPublicKey: signedPreKeyPair.publicKey,
    signedPrekeyCreatedAtMs: createdAtMs,
    signedPrekeyExpiresAtMs: signedPreKeyExpiresAtMs,
  });
  const bundleSignature = sign(signing.privateKey, bundleBytes);

  const oneTimePreKeys = Array.from({ length: INITIAL_ONE_TIME_PREKEY_COUNT }, (_, index) => ({
    id: index + 1,
    keyPair: generateKeyAgreementKeyPair(),
  }));

  const identity: LocalDeviceIdentity = {
    actorId: input.actorId,
    deviceId,
    keys: { signing, agreement },
    selfDevice,
    ownRoster,
    signedPreKey: {
      id: cryptoSignedPreKey.id,
      keyPair: signedPreKeyPair,
      createdAtMs: cryptoSignedPreKey.createdAtMs,
      expiresAtMs: cryptoSignedPreKey.expiresAtMs,
      signature: cryptoSignedPreKey.signature,
    },
    oneTimePreKeys,
  };

  const publishRootRequest: PublishIdentityRootRequest | undefined = bootstrap
    ? create(PublishIdentityRootRequestSchema, {
        identityRoot: buildBootstrapIdentityRoot({
          actorId: input.actorId,
          privateKey: rootKeys.privateKey,
          publicKey: rootKeys.publicKey,
          createdAtMs,
        }),
      })
    : undefined;

  const enrollRequest: EnrollDeviceRequest = create(EnrollDeviceRequestSchema, {
    certificate: {
      actorId: input.actorId,
      deviceId,
      rootGeneration: 1,
      certificateVersion: 1,
      signingPublicKey: signing.publicKey,
      agreementPublicKey: agreement.publicKey,
      supportedProtocolVersions: supportedVersions,
      createdAt: fromDate(new Date(createdAtMs)),
      expiresAt: fromDate(new Date(expiresAtMs)),
      certificateBytes,
      rootSignature: certificateRootSignature,
      certificateDigest,
      status: E2EE_DEVICE_STATUS.ACTIVE,
    },
    roster: {
      actorId: input.actorId,
      sequence: 1n,
      rootGeneration: 1,
      previousDigest: new Uint8Array(KEY_BYTES),
      digest: rosterDigestValue,
      rosterBytes,
      rootSignature: rosterRootSignature,
      entries: [
        {
          deviceId,
          certificateDigest,
          active: true,
          addedAt: fromDate(new Date(addedAtMs)),
        },
      ],
      createdAt: fromDate(new Date(createdAtMs)),
    },
    signedPrekey: {
      keyId: BigInt(signedPreKeyId),
      publicKey: signedPreKeyPair.publicKey,
      signature: bundleSignature,
      createdAt: fromDate(new Date(createdAtMs)),
      expiresAt: fromDate(new Date(signedPreKeyExpiresAtMs)),
    },
    oneTimePrekeys: oneTimePreKeys.map((prekey) => ({
      keyId: BigInt(prekey.id),
      publicKey: prekey.keyPair.publicKey,
    })),
    prekeyBundleBytes: bundleBytes,
    prekeyBundleSignature: bundleSignature,
  });

  const record: StoredEnrollment = {
    submitted: false,
    createdRoot: bootstrap,
    rootPrivate: rootKeys.privateKey,
    rootPublic: rootKeys.publicKey,
    rootGeneration: 1,
    identity,
    wire: {
      certificateBytes,
      certificateRootSignature,
      rosterSequence: 1n,
      rosterBytes,
      rosterDigestValue,
      rosterRootSignature,
      addedAtMs,
      signedPrekeyId: signedPreKeyId,
      bundleBytes,
      bundleSignature,
    },
  };
  return { record, publishRootRequest, enrollRequest };
}

/** Rebuilds the exact `EnrollDeviceRequest` a stored (not-yet-accepted) record produced,
 * so a crash between persist and accept resumes byte-identical material. */
export function enrollRequestFromRecord(record: StoredEnrollment): EnrollDeviceRequest {
  const certificate = record.identity.selfDevice.certificate;
  return create(EnrollDeviceRequestSchema, {
    certificate: {
      actorId: record.identity.actorId,
      deviceId: record.identity.deviceId,
      rootGeneration: 1,
      certificateVersion: 1,
      signingPublicKey: certificate.signingPublicKey,
      agreementPublicKey: certificate.agreementPublicKey,
      supportedProtocolVersions: [E2EE_PROTOCOL_V1],
      createdAt: fromDate(new Date(certificate.createdAtMs)),
      expiresAt: fromDate(new Date(certificate.expiresAtMs)),
      certificateBytes: record.wire.certificateBytes,
      rootSignature: record.wire.certificateRootSignature,
      certificateDigest: sha256Hash(record.wire.certificateBytes),
      status: E2EE_DEVICE_STATUS.ACTIVE,
    },
    roster: {
      actorId: record.identity.actorId,
      sequence: record.wire.rosterSequence,
      rootGeneration: 1,
      previousDigest: new Uint8Array(KEY_BYTES),
      digest: record.wire.rosterDigestValue,
      rosterBytes: record.wire.rosterBytes,
      rootSignature: record.wire.rosterRootSignature,
      entries: [
        {
          deviceId: record.identity.deviceId,
          certificateDigest: sha256Hash(record.wire.certificateBytes),
          active: true,
          addedAt: fromDate(new Date(record.wire.addedAtMs)),
        },
      ],
      createdAt: fromDate(new Date(certificate.createdAtMs)),
    },
    signedPrekey: {
      keyId: BigInt(record.wire.signedPrekeyId),
      publicKey: record.identity.signedPreKey.keyPair.publicKey,
      signature: record.wire.bundleSignature,
      createdAt: fromDate(new Date(record.identity.signedPreKey.createdAtMs)),
      expiresAt: fromDate(new Date(record.identity.signedPreKey.expiresAtMs)),
    },
    oneTimePrekeys: record.identity.oneTimePreKeys.map((prekey) => ({
      keyId: BigInt(prekey.id),
      publicKey: prekey.keyPair.publicKey,
    })),
    prekeyBundleBytes: record.wire.bundleBytes,
    prekeyBundleSignature: record.wire.bundleSignature,
  });
}

function buildBootstrapIdentityRoot(input: {
  readonly actorId: string;
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly createdAtMs: number;
}): E2eeIdentityRoot {
  // The root transcript is opaque to the node beyond its self-signature; keep it
  // minimal, deterministic, and free of anything secret.
  const rootBytes = new TextEncoder().encode(`patches-e2ee-v1/root\u0000${input.actorId}\u00001`);
  return create(E2eeIdentityRootSchema, {
    actorId: input.actorId,
    generation: 1,
    publicKey: input.publicKey,
    rootBytes,
    selfSignature: sign(input.privateKey, rootBytes),
    previousRootSignature: new Uint8Array(0),
    createdAt: fromDate(new Date(input.createdAtMs)),
  });
}

// ---------------------------------------------------------------------------
// Vault persistence
// ---------------------------------------------------------------------------

export async function saveStoredEnrollment(
  vault: RatchetSessionVault,
  record: StoredEnrollment,
): Promise<void> {
  await vault.putOpaqueRecord(ENROLLMENT_RECORD_KEY, encodeStoredEnrollment(record));
}

export async function loadStoredEnrollment(
  vault: RatchetSessionVault,
): Promise<StoredEnrollment | undefined> {
  const bytes = await vault.getOpaqueRecord(ENROLLMENT_RECORD_KEY);
  if (bytes === undefined) return undefined;
  try {
    return decodeStoredEnrollment(bytes);
  } catch {
    // An undecodable identity record cannot be trusted for enrollment purposes; treat
    // it as absent rather than half-trusting it. Session records remain governed by the
    // ratchet store's own corruption handling.
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type EnrollOutcome =
  | {
      readonly status: 'enrolled';
      readonly identity: LocalDeviceIdentity;
      /** True when this run bootstrapped the account root (first device on the account). */
      readonly createdRoot: boolean;
      /** Roster sequence this enrollment published (always ≥ 1). */
      readonly rosterSequence: bigint;
    }
  | { readonly status: 'already-enrolled'; readonly identity: LocalDeviceIdentity }
  | {
      readonly status: 'refused';
      readonly reason: 'capability-off' | 'remote-root';
      readonly copy: string;
    };

export interface EnrollThisDeviceInput {
  readonly actorId: string;
  readonly transport: EnrollmentTransport;
  readonly vault: RatchetSessionVault;
  readonly nowMs?: () => number;
}

/**
 * Runs the enrollment flow idempotently. Safe to call again after any failure: either a
 * resumable record exists, or nothing was ever persisted. Transport failures propagate
 * untouched after the record is durable — the caller renders fixed copy, and the next
 * attempt re-submits identical material instead of minting orphan keys.
 */
export async function enrollThisDevice(input: EnrollThisDeviceInput): Promise<EnrollOutcome> {
  const nowMs = input.nowMs ?? Date.now;
  const existing = await loadStoredEnrollment(input.vault);
  if (existing !== undefined && existing.submitted) {
    return { status: 'already-enrolled', identity: existing.identity };
  }

  const capability = await input.transport.getCapability().catch(() => undefined);
  if (
    capability === undefined ||
    !isCapabilityUsable(capability.state) ||
    !capability.supportedProtocolVersions.includes(E2EE_PROTOCOL_V1)
  ) {
    return {
      status: 'refused',
      reason: 'capability-off',
      copy: ENROLLMENT_REFUSAL_COPY.capabilityOff,
    };
  }

  let record = existing;
  if (record === undefined) {
    const remoteRoot = await input.transport.getIdentityRoot(input.actorId).catch(() => undefined);
    // `undefined` covers both "nothing published" (the bootstrap path) and a failed
    // lookup; the latter retries on the next attempt, still having persisted nothing.
    if (remoteRoot !== undefined && remoteRoot.publicKey.length > 0) {
      return { status: 'refused', reason: 'remote-root', copy: ENROLLMENT_REFUSAL_COPY.remoteRoot };
    }
    const generated = generateEnrollment({ actorId: input.actorId, nowMs: nowMs() });
    // Durable BEFORE any network call (ADR 0020 §4): the node must never hold keys this
    // device could lose in a crash, and a retry reuses — never regenerates — them.
    await saveStoredEnrollment(input.vault, generated.record);
    record = generated.record;
    if (generated.publishRootRequest !== undefined) {
      await input.transport.publishIdentityRoot(generated.publishRootRequest);
    }
  }

  await input.transport.enrollDevice(enrollRequestFromRecord(record));

  const submittedRecord: StoredEnrollment = { ...record, submitted: true };
  await saveStoredEnrollment(input.vault, submittedRecord);
  return {
    status: 'enrolled',
    identity: submittedRecord.identity,
    createdRoot: submittedRecord.createdRoot,
    rosterSequence: submittedRecord.wire.rosterSequence,
  };
}

/** Capability states at which a node accepts enrollment traffic. `UNSPECIFIED`(0) /
 * `DISABLED`(1) nodes do not; 2–5 mirror `E2eeCapabilityState`'s staged rollout states
 * (ADR 0020 §11) — the client follows the node's answer, never its own guess. */
function isCapabilityUsable(state: number): boolean {
  return state >= 2 && state <= 5;
}

/** Best-effort hygiene only (ADR 0020 §4): drop the in-memory copy of a loaded record. */
export function disposeStoredEnrollment(record: StoredEnrollment): void {
  zeroize(record.rootPrivate);
}
