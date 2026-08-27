/**
 * Device enrollment (B-107, ADR 0020 §2–§3, ADR 0033) — web port of the TUI flow: turns
 * this browser into a real, locally-held messaging device.
 *
 * The flow, in order — every step fails closed, never a half-trusted state:
 *
 *   1. Preflight against `GetE2eeCapability` (rollout state + protocol versions). A
 *      first device bootstraps the account root here (`PublishIdentityRoot`, generation
 *      1); an account that already publishes a root this browser does not hold is
 *      refused honestly — adopting or linking an existing authority key is recovery
 *      work, not enrollment (ADR 0020 §2: ordinary devices never receive the root
 *      private key; the root lives in this vault per the recovery design).
 *   2. Generate this device's Ed25519 signing + X25519 agreement keypairs in the
 *      browser (`@noble/curves` — no Node crypto anywhere in this path), then mint the
 *      ONE canonical identity transcript family (ADR 0033 §1) from those keys via
 *      `@patches/crypto`'s `sign*` functions, and immediately re-verify every minted
 *      value through the matching `verify*` — even this device's own material never
 *      skips the check a peer's would have to pass (ADR 0033 §3).
 *   3. Persist EVERYTHING through the encrypted vault BEFORE any bytes reach the node
 *      (ADR 0020 §4's commit-before-network rule, applied to identity): the node must
 *      never hold keys this device could lose to a crash. A stored record whose
 *      submission never completed resumes verbatim on the next attempt, and reloading
 *      it re-runs the same verifiers rather than trusting the disk (ADR 0033 §3).
 *   4. Call `EnrollDevice` with certificate + signed roster + signed prekey bundle +
 *      one-time prekeys, over Connect through `@patches/client`. The wire bytes ARE the
 *      `@patches/crypto` transcript bytes — the node verifies with the same decoder.
 *
 * Hard rules carried over from the runtime (ADR 0020 §4 / spec §194): no key material
 * or transcript bytes ever reach an error message or log line; user-facing copy is fixed.
 */
import { create } from '@bufbuild/protobuf';
import {
  E2eeDeviceRosterSchema,
  E2eeIdentityRootSchema,
  EnrollDeviceRequestSchema,
  PublishIdentityRootRequestSchema,
} from '@patches/proto/es';
import {
  signDeviceCertificate,
  signDeviceRoster,
  signMessagingRoot,
  signPreKeyBundle,
  sortRosterEntries,
  verifyCertifiedDevice,
  verifyMessagingRoot,
  verifyRosterSnapshot,
  zeroize,
  ByteReader,
  ByteWriter,
  KEY_BYTES,
  SIGNATURE_BYTES,
  generateKeyAgreementKeyPair,
  generateSigningKeyPair,
  randomBytes,
  type DeviceRosterEntryTranscript,
  type KeyPair,
  type VerifiedRosterSnapshot,
} from '@patches/crypto';
import {
  E2EE_DEVICE_CERTIFICATE_VERSION,
  E2EE_ONE_TIME_PREKEY_TARGET,
  E2EE_PROTOCOL_V1,
} from '@patches/domain';
import {
  E2eeDeviceStatus,
  type EnrollDeviceRequest,
  type E2eeDeviceCertificate,
  type E2eeDeviceRoster,
  type E2eeIdentityRoot,
  type E2eeOneTimePrekey,
  type E2eeServiceBeginDeviceLinkRequest,
  type E2eeServiceBeginDeviceLinkResponse,
  type E2eeServiceListPendingDeviceLinksResponse,
  type E2eeSignedPrekey,
  type PublishIdentityRootRequest,
} from '@patches/proto/es';

import { fromDate, toDate } from './wire-time.js';
import type {
  LocalDeviceIdentity,
  LocalOneTimePreKey,
  LocalSignedPreKeyBundle,
} from './local-identity.js';
import type { RatchetSessionVault } from './vault.js';

/** Certificate validity window (ADR 0020 §2 leaves the cadence to clients; 30 days keeps
 * renewal a routine, root-signed roster bump rather than an identity event). Exported for
 * `device-link.ts` (ADR 0037 §1): the offering device must predict the same
 * `certificateExpiresAtMs` the authority will later use, so the certificate digest baked into
 * its prekey bundle matches byte-for-byte. */
export const CERTIFICATE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
/** Signed-prekey rotation window (ADR 0020 §5: seven days). */
const SIGNED_PREKEY_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
/** One-time prekeys created at enrollment; `UploadPrekeys` replenishes later. */
const INITIAL_ONE_TIME_PREKEY_COUNT = E2EE_ONE_TIME_PREKEY_TARGET;
/** ADR 0020 §2: enrollment always mints the account's first root generation. */
const ROOT_GENERATION = 1;
/** ADR 0020 §2: enrollment always mints roster sequence 1. */
const ROSTER_SEQUENCE = 1;

// ---------------------------------------------------------------------------
// User copy — fixed strings only (no key material can ever parameterize these)
// ---------------------------------------------------------------------------

export const ENROLLMENT_REFUSAL_COPY = {
  capabilityOff:
    'This node has not enabled end-to-end encrypted messaging, so no device can be enrolled here.',
} as const;

/**
 * ADR 0037 §2: when enrollment finds a published root this device does not hold, a refusal
 * is no longer the only answer — the client offers exactly three fixed-copy outcomes. `cancel`
 * leaves the account exactly as `enrollThisDevice` found it; no fourth option deletes anything.
 */
export const NEEDS_AUTHORITY_COPY = {
  summary:
    'This account already has a messaging identity published from another device, and this ' +
    'device does not hold its authority key.',
  link: 'Link this device — approve from a device that already has your messaging identity.',
  rotate:
    'Start a new messaging identity: everyone you message will be warned, and history on ' +
    'lost devices is not recoverable.',
  cancel: 'Cancel.',
} as const;

/** Fixed choice set ADR 0037 §2 allows when a remote root is unreachable from this device. */
export const NEEDS_AUTHORITY_OPTIONS = ['link', 'rotate', 'cancel'] as const;
export type NeedsAuthorityOption = (typeof NEEDS_AUTHORITY_OPTIONS)[number];

/** ADR 0020 §3: adding a certified device is a visible security event for peers — shown
 * on the enrollment result, not buried in help. */
export const ENROLLMENT_PEER_WARNING_COPY =
  'Your enrolled-device list changed. People you chat with will see a new-device security ' +
  'notice on their next check; your safety number with them does not change. If you did not ' +
  'just approve this on purpose, revoke the device now.';

// ---------------------------------------------------------------------------
// Enrollment transport seam — implemented by the app shell over `@patches/client`
// ---------------------------------------------------------------------------

/** Structural capability view the flow needs (mirrors `GetE2eeCapabilityResponse`). */
export interface EnrollmentCapability {
  readonly state: number;
  readonly supportedProtocolVersions: readonly string[];
}

/** Structural view of `GetDeviceRosterResponse` the linking/rotation flows need. */
export interface EnrollmentDeviceRoster {
  readonly roster: E2eeDeviceRoster | undefined;
  readonly certificates: readonly E2eeDeviceCertificate[];
}

export interface EnrollmentTransport {
  getCapability(): Promise<EnrollmentCapability | undefined>;
  /** The account's current published root, or `undefined` when there is none yet. */
  getIdentityRoot(actorId: string): Promise<E2eeIdentityRoot | undefined>;
  publishIdentityRoot(request: PublishIdentityRootRequest): Promise<unknown>;
  enrollDevice(request: EnrollDeviceRequest): Promise<unknown>;
  /** The caller's own current device roster + certificates (ADR 0037 §1/§2). */
  getDeviceRoster(actorId: string): Promise<EnrollmentDeviceRoster>;
  /** Posts a new device's link offer (ADR 0037 §1). */
  beginDeviceLink(
    request: E2eeServiceBeginDeviceLinkRequest,
  ): Promise<E2eeServiceBeginDeviceLinkResponse>;
  /** The caller's own pending link offers (ADR 0037 §1). */
  listPendingDeviceLinks(): Promise<E2eeServiceListPendingDeviceLinksResponse>;
  /** Discards a pending offer (ADR 0037 §1, §3.4). */
  cancelDeviceLink(linkId: string): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Stored record — everything needed to resume, re-submit, and run the runtime
// ---------------------------------------------------------------------------

/** Reserved vault record key. The leading NUL cannot occur in a real session id
 * (`sessionIdFor` composes UUID conversation ids), so the runtime can never collide. */
export const ENROLLMENT_RECORD_KEY = '\0patches-e2ee-enrollment';

export interface StoredEnrollment {
  /** True once `EnrollDevice` resolved successfully at least once. */
  readonly submitted: boolean;
  /** True when this device bootstrapped the account root (`PublishIdentityRoot` gen 1). */
  readonly createdRoot: boolean;
  /**
   * Absent for an ordinary linked device (ADR 0037 §1): linking never copies the root key,
   * so a linked device's record has nothing here to hold. Present for the bootstrap device
   * and for an authority that later imports a recovery archive (#272).
   */
  readonly rootPrivate: Uint8Array | undefined;
  readonly rootPublic: Uint8Array;
  readonly identity: LocalDeviceIdentity;
}

function writeKey(writer: ByteWriter, key: KeyPair): void {
  writer.fixed(key.privateKey, KEY_BYTES).fixed(key.publicKey, KEY_BYTES);
}

function readKey(reader: ByteReader): KeyPair {
  return { privateKey: reader.fixed(KEY_BYTES), publicKey: reader.fixed(KEY_BYTES) };
}

/**
 * Serializes the raw signed material a `StoredEnrollment` rests on: private keys plus
 * every `*Bytes`/`*Signature` pair the matching `verify*` needs to reconstruct the
 * branded `Verified*` values on load. Nothing here is trusted on decode without
 * re-running those verifiers (ADR 0033 §3) — a corrupted or tampered record fails
 * closed rather than resurrecting an unverified identity.
 */
/** Current codec version.
 *
 * v1 -> v2: let `rootPrivate` be absent (ADR 0037 §1: an ordinary linked device never holds the
 * root key) — `decodeStoredEnrollment` still reads a version-1 record, which always carried a
 * present `rootPrivate`.
 *
 * v2 -> v3: append every OTHER active roster entry's certificate (ADR 0037 §1: once a second
 * device is linked, `identity.ownRoster` has more than one active entry, and
 * `verifyRosterSnapshot` on reload needs a certificate for each of them — v1/v2 only ever
 * round-tripped this device's own certificate, which was sufficient while a roster could only
 * ever have exactly one active entry). `identity.ownRoster.devices` already holds every active
 * entry's verified certificate (it is what `verifyRosterSnapshot` itself built), so encoding
 * just serializes the ones that are not this device's own (already written above).
 */
const STORED_ENROLLMENT_VERSION = 3;

export function encodeStoredEnrollment(record: StoredEnrollment): Uint8Array {
  const identity = record.identity;
  const root = identity.ownRoster.root;
  const writer = new ByteWriter()
    .u8(STORED_ENROLLMENT_VERSION)
    .u8(record.submitted ? 1 : 0)
    .u8(record.createdRoot ? 1 : 0)
    .u8(record.rootPrivate === undefined ? 0 : 1);
  if (record.rootPrivate !== undefined) writer.fixed(record.rootPrivate, KEY_BYTES);
  writer.fixed(record.rootPublic, KEY_BYTES);
  writer.bytes(root.rootBytes).fixed(root.selfSignature, SIGNATURE_BYTES);
  writeKey(writer, identity.keys.signing);
  writeKey(writer, identity.keys.agreement);
  writer.bytes(identity.selfDevice.certificateBytes);
  writer.fixed(identity.selfDevice.rootSignature, SIGNATURE_BYTES);
  writer.bytes(identity.ownRoster.rosterBytes);
  writer.fixed(identity.ownRoster.rootSignature, SIGNATURE_BYTES);
  writer.u32(identity.signedPreKey.id);
  writeKey(writer, identity.signedPreKey.keyPair);
  writer.u64(identity.signedPreKey.createdAtMs).u64(identity.signedPreKey.expiresAtMs);
  writer.bytes(identity.ownBundle.bundleBytes);
  writer.fixed(identity.ownBundle.deviceSignature, SIGNATURE_BYTES);
  writer.u32(identity.oneTimePreKeys.length);
  for (const prekey of identity.oneTimePreKeys) {
    writer.u32(prekey.id);
    writeKey(writer, prekey.keyPair);
  }
  const otherDevices = identity.ownRoster.devices.filter(
    (device) => device.deviceId !== identity.deviceId,
  );
  writer.u32(otherDevices.length);
  for (const device of otherDevices) {
    writer.bytes(device.certificateBytes);
    writer.fixed(device.rootSignature, SIGNATURE_BYTES);
  }
  return writer.finish();
}

/** Reconstructs a `StoredEnrollment`, re-verifying every transcript against `nowMs`
 * exactly as a peer receiving this device's published material would (ADR 0033 §3). */
export function decodeStoredEnrollment(bytes: Uint8Array, nowMs: number): StoredEnrollment {
  const reader = new ByteReader(bytes);
  const version = reader.u8();
  if (version !== 1 && version !== 2 && version !== 3) {
    throw new Error('Unsupported enrollment record version.');
  }
  const submitted = reader.u8() === 1;
  const createdRoot = reader.u8() === 1;
  // v1 always carried a present rootPrivate (32 bytes, no presence byte); v2 adds the byte
  // so an ordinary linked device (ADR 0037 §1) can omit it entirely.
  const rootPrivate = version === 1 || reader.u8() === 1 ? reader.fixed(KEY_BYTES) : undefined;
  const rootPublic = reader.fixed(KEY_BYTES);
  const rootBytes = reader.bytes();
  const rootSelfSignature = reader.fixed(SIGNATURE_BYTES);
  const signing = readKey(reader);
  const agreement = readKey(reader);
  const certificateBytes = reader.bytes();
  const certificateRootSignature = reader.fixed(SIGNATURE_BYTES);
  const rosterBytes = reader.bytes();
  const rosterRootSignature = reader.fixed(SIGNATURE_BYTES);
  const signedPreKeyId = reader.u32();
  const signedPreKeyPair = readKey(reader);
  const signedPreKeyCreatedAtMs = reader.u64();
  const signedPreKeyExpiresAtMs = reader.u64();
  const bundleBytes = reader.bytes();
  const bundleSignature = reader.fixed(SIGNATURE_BYTES);
  const oneTimeCount = reader.u32();
  const oneTimePreKeys: LocalOneTimePreKey[] = [];
  for (let index = 0; index < oneTimeCount; index += 1) {
    const id = reader.u32();
    oneTimePreKeys.push({ id, keyPair: readKey(reader) });
  }
  // v1/v2 records predate multi-device rosters (ADR 0037 §1) and carry no other device's
  // certificate — this device's own is always sufficient for them, since their roster could
  // only ever have exactly one active entry.
  const otherCertificates: { certificateBytes: Uint8Array; rootSignature: Uint8Array }[] = [];
  if (version === 3) {
    const otherCount = reader.u32();
    for (let index = 0; index < otherCount; index += 1) {
      otherCertificates.push({
        certificateBytes: reader.bytes(),
        rootSignature: reader.fixed(SIGNATURE_BYTES),
      });
    }
  }
  reader.end();

  const root = verifyMessagingRoot({ rootBytes, selfSignature: rootSelfSignature, nowMs });
  const selfDevice = verifyCertifiedDevice({
    certificateBytes,
    rootSignature: certificateRootSignature,
    root,
    nowMs,
  });
  const ownRoster = verifyRosterSnapshot({
    rosterBytes,
    rootSignature: rosterRootSignature,
    root,
    certificates: [
      { certificateBytes, rootSignature: certificateRootSignature },
      ...otherCertificates,
    ],
    nowMs,
  });

  const identity: LocalDeviceIdentity = {
    actorId: selfDevice.actorId,
    deviceId: selfDevice.deviceId,
    keys: { signing, agreement },
    selfDevice,
    ownRoster,
    signedPreKey: {
      id: signedPreKeyId,
      keyPair: signedPreKeyPair,
      createdAtMs: signedPreKeyCreatedAtMs,
      expiresAtMs: signedPreKeyExpiresAtMs,
    },
    ownBundle: { bundleBytes, deviceSignature: bundleSignature },
    oneTimePreKeys,
  };
  return { submitted, createdRoot, rootPrivate, rootPublic, identity };
}

// ---------------------------------------------------------------------------
// Material generation (deterministic aside from randomness; injectable clock for tests)
// ---------------------------------------------------------------------------

export interface GenerateEnrollmentInput {
  readonly actorId: string;
  /**
   * Present when resuming (linking) around an existing authority; absent on first-device
   * bootstrap. `createdAtMs` and `generation` must be the ALREADY-PUBLISHED root's own
   * values — required to reconstruct the exact `VerifiedMessagingRoot`
   * `signDeviceCertificate`'s caller must hold (ADR 0033 §3: no verifier accepts a
   * caller-supplied decoding; Ed25519 signing is deterministic, so re-signing the same
   * fields with the same key reproduces the same published root bytes rather than
   * minting a new one).
   */
  readonly root?: {
    readonly privateKey: Uint8Array;
    readonly publicKey: Uint8Array;
    readonly createdAtMs: number;
    /** Defaults to 1 (an account's first root generation) for callers that only ever
     * reconstruct that root — e.g. re-minting a peer's identity from its own already
     * self-signed material in a test. A linking caller passes the real generation. */
    readonly generation?: number;
    /** The account's most recently published roster, or `undefined` if this authority
     * has never published one — the new device becomes sequence 1. Every existing entry
     * (active or revoked) is carried forward verbatim; linking must never drop a device
     * from the roster (spec §14.4). */
    readonly currentRoster?: VerifiedRosterSnapshot | undefined;
    /** Certificates for every entry `currentRoster` lists, so the rebuilt roster can be
     * re-verified locally — the linking device holds none of its peers' certificates.
     * The caller obtains these from `GetDeviceRoster`. Omit/empty when `currentRoster`
     * is `undefined`. */
    readonly certificates?: readonly {
      readonly certificateBytes: Uint8Array;
      readonly rootSignature: Uint8Array;
    }[];
  };
  /**
   * ADR 0037 §1: the authority-side device-link approval path. When present, the caller
   * (an authority device that holds `root` above but NOT the new device's private keys)
   * supplies the new device's already-generated PUBLIC material and its already
   * device-signed prekey bundle verbatim — `generateEnrollment` signs only the
   * certificate and roster (it holds the root key) and never re-signs, and never could
   * re-sign, anything requiring the new device's signing key. `certificateCreatedAtMs`/
   * `certificateExpiresAtMs` MUST equal the values the offering device used to compute
   * the `certificateDigest` baked into `prekeyBundleBytes` (see `device-link.ts`'s
   * `beginDeviceLinkOffer`) — the authority reconstructs a byte-identical certificate
   * transcript rather than minting a new one, so the passed-through bundle signature
   * stays valid without the authority ever touching the device's signing key.
   */
  readonly deviceMaterial?: {
    readonly deviceId: string;
    readonly signingPublicKey: Uint8Array;
    readonly agreementPublicKey: Uint8Array;
    readonly supportedProtocolVersions: readonly string[];
    readonly certificateCreatedAtMs: number;
    readonly certificateExpiresAtMs: number;
    readonly signedPrekey: E2eeSignedPrekey;
    readonly oneTimePrekeys: readonly E2eeOneTimePrekey[];
    readonly prekeyBundleBytes: Uint8Array;
    readonly prekeyBundleSignature: Uint8Array;
  };
  readonly nowMs: number;
}

export interface GeneratedEnrollment {
  readonly record: StoredEnrollment;
  readonly publishRootRequest: PublishIdentityRootRequest | undefined;
  readonly enrollRequest: EnrollDeviceRequest;
}

export function randomDeviceId(): string {
  // UUID-shaped per the node's DEVICE_ID_PATTERN (`[0-9a-f-]{8,64}`); random per ADR
  // 0020 §2 ("not derived from hardware, an account id, or a key"). `randomBytes` is
  // `@noble/ciphers/utils`' browser-safe source (`crypto.getRandomValues`).
  const hex: string[] = [];
  for (const byte of randomBytes(16)) hex.push(byte.toString(16).padStart(2, '0'));
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 32)}`;
}

/**
 * Everything a device generates for itself before it holds any signature: signing +
 * agreement keypairs, device id, and an initial signed-prekey/one-time-prekey inventory.
 * Shared by `generateEnrollment` (bootstrap/authority-side certificate issuance) and
 * `device-link.ts`'s `beginDeviceLinkOffer` (ADR 0037 §1's new-device offer), so the two
 * paths mint identically-shaped material instead of drifting apart.
 */
export interface DeviceKeyMaterial {
  readonly deviceId: string;
  readonly signing: KeyPair;
  readonly agreement: KeyPair;
  readonly supportedProtocolVersions: readonly string[];
  /** This device's own local clock reading (ms since epoch), floored 1s into the past —
   * shared as the base for every timestamp below so they stay internally consistent. */
  readonly createdAtMs: number;
  readonly signedPreKeyId: number;
  readonly signedPreKeyPair: KeyPair;
  readonly signedPreKeyExpiresAtMs: number;
  readonly oneTimePreKeys: readonly LocalOneTimePreKey[];
}

export function generateDeviceKeyMaterial(nowMs: number): DeviceKeyMaterial {
  const createdAtMs = Math.max(0, nowMs - 1000);
  return {
    deviceId: randomDeviceId(),
    signing: generateSigningKeyPair(),
    agreement: generateKeyAgreementKeyPair(),
    supportedProtocolVersions: [E2EE_PROTOCOL_V1],
    createdAtMs,
    signedPreKeyId: 1,
    signedPreKeyPair: generateKeyAgreementKeyPair(),
    signedPreKeyExpiresAtMs: createdAtMs + SIGNED_PREKEY_LIFETIME_MS,
    oneTimePreKeys: Array.from({ length: INITIAL_ONE_TIME_PREKEY_COUNT }, (_, index) => ({
      id: index + 1,
      keyPair: generateKeyAgreementKeyPair(),
    })),
  };
}

/** A public-only placeholder `KeyPair` for material this device never holds the private
 * half of (ADR 0037 §1's authority-side approval path) — never persisted or signed with. */
function publicOnlyKeyPair(publicKey: Uint8Array): KeyPair {
  return { privateKey: new Uint8Array(0), publicKey };
}

/**
 * Builds one complete enrollment: keypairs, the ONE canonical transcript family's
 * signatures (ADR 0033 §1), the prekey inventory, and the two wire requests. Every
 * minted value is immediately re-verified through `@patches/crypto`'s strict verifiers
 * (ADR 0033 §3) — there is no separate, unverified in-memory shape.
 */
export function generateEnrollment(input: GenerateEnrollmentInput): GeneratedEnrollment {
  const bootstrap = input.root === undefined;
  const nowMs = input.nowMs;
  const deviceMaterial = input.deviceMaterial;
  // Bootstrap/link (this device holds its own keys): mint fresh material via the shared
  // helper. Authority-side approval (`deviceMaterial` present): every key below is the
  // OFFERING device's public material — this device never generated it and never will
  // hold its private half (ADR 0037 §1).
  const generated = deviceMaterial === undefined ? generateDeviceKeyMaterial(nowMs) : undefined;
  const createdAtMs =
    deviceMaterial?.certificateCreatedAtMs ?? (generated as DeviceKeyMaterial).createdAtMs;
  const expiresAtMs =
    deviceMaterial?.certificateExpiresAtMs ?? createdAtMs + CERTIFICATE_LIFETIME_MS;

  const rootKeys = input.root ?? {
    ...generateSigningKeyPair(),
    createdAtMs,
  };
  const rootGeneration = input.root?.generation ?? ROOT_GENERATION;
  const signedRoot = signMessagingRoot(rootKeys.privateKey, {
    actorId: input.actorId,
    generation: rootGeneration,
    publicKey: rootKeys.publicKey,
    createdAtMs: rootKeys.createdAtMs,
  });
  const root = verifyMessagingRoot({
    rootBytes: signedRoot.rootBytes,
    selfSignature: signedRoot.selfSignature,
    nowMs,
  });

  const signing =
    deviceMaterial === undefined
      ? (generated as DeviceKeyMaterial).signing
      : publicOnlyKeyPair(deviceMaterial.signingPublicKey);
  const agreement =
    deviceMaterial === undefined
      ? (generated as DeviceKeyMaterial).agreement
      : publicOnlyKeyPair(deviceMaterial.agreementPublicKey);
  const deviceId = deviceMaterial?.deviceId ?? (generated as DeviceKeyMaterial).deviceId;
  const supportedVersions =
    deviceMaterial?.supportedProtocolVersions ??
    (generated as DeviceKeyMaterial).supportedProtocolVersions;

  const signedCertificate = signDeviceCertificate(rootKeys.privateKey, {
    actorId: input.actorId,
    deviceId,
    rootGeneration,
    rootPublicKey: rootKeys.publicKey,
    certificateVersion: E2EE_DEVICE_CERTIFICATE_VERSION,
    signingPublicKey: signing.publicKey,
    agreementPublicKey: agreement.publicKey,
    supportedProtocolVersions: [...supportedVersions],
    createdAtMs,
    expiresAtMs,
  });
  const selfDevice = verifyCertifiedDevice({
    certificateBytes: signedCertificate.certificateBytes,
    rootSignature: signedCertificate.rootSignature,
    root,
    nowMs,
  });

  const addedAtMs = createdAtMs;
  // Non-bootstrap: carry every existing entry forward verbatim (§14.4 — linking must
  // never drop a device) and chain onto the account's current roster. Bootstrap has no
  // prior roster, so this collapses to the original sequence-1/genesis-digest values.
  const currentRoster = input.root?.currentRoster;
  const sequence = currentRoster !== undefined ? currentRoster.sequence + 1 : ROSTER_SEQUENCE;
  const previousDigest =
    currentRoster !== undefined ? currentRoster.rosterDigest : new Uint8Array(KEY_BYTES);
  const carriedEntries: DeviceRosterEntryTranscript[] =
    currentRoster === undefined
      ? []
      : currentRoster.entries.map((entry) => ({
          deviceId: entry.deviceId,
          certificateDigest: entry.certificateDigest,
          active: entry.active,
          addedAtMs: entry.addedAtMs,
          ...(entry.revokedAtMs === undefined ? {} : { revokedAtMs: entry.revokedAtMs }),
        }));
  const newEntry: DeviceRosterEntryTranscript = {
    deviceId,
    certificateDigest: signedCertificate.certificateDigest,
    active: true,
    addedAtMs,
  };
  const signedRoster = signDeviceRoster(rootKeys.privateKey, {
    actorId: input.actorId,
    rootGeneration,
    rootPublicKey: rootKeys.publicKey,
    sequence,
    previousDigest,
    createdAtMs,
    entries: sortRosterEntries([...carriedEntries, newEntry]),
  });
  const ownRoster = verifyRosterSnapshot({
    rosterBytes: signedRoster.rosterBytes,
    rootSignature: signedRoster.rootSignature,
    root,
    certificates: [
      ...(input.root?.certificates ?? []),
      {
        certificateBytes: signedCertificate.certificateBytes,
        rootSignature: signedCertificate.rootSignature,
      },
    ],
    nowMs,
  });

  let signedPreKeyId: number;
  let signedPreKeyPair: KeyPair;
  let signedPreKeyExpiresAtMs: number;
  let oneTimePreKeys: LocalOneTimePreKey[];
  let ownBundle: LocalSignedPreKeyBundle;
  if (deviceMaterial === undefined) {
    const own = generated as DeviceKeyMaterial;
    signedPreKeyId = own.signedPreKeyId;
    signedPreKeyPair = own.signedPreKeyPair;
    signedPreKeyExpiresAtMs = own.signedPreKeyExpiresAtMs;
    oneTimePreKeys = own.oneTimePreKeys.slice();
    const signedBundle = signPreKeyBundle(signing.privateKey, {
      actorId: input.actorId,
      deviceId,
      certificateDigest: signedCertificate.certificateDigest,
      signedPrekeyId: signedPreKeyId,
      signedPrekeyPublicKey: signedPreKeyPair.publicKey,
      createdAtMs,
      expiresAtMs: signedPreKeyExpiresAtMs,
    });
    ownBundle = {
      bundleBytes: signedBundle.bundleBytes,
      deviceSignature: signedBundle.deviceSignature,
    };
  } else {
    // Authority-side approval (ADR 0037 §1): the prekey bundle was already device-signed
    // by the offering device against the certificate digest it predicted for exactly
    // these `certificateCreatedAtMs`/`certificateExpiresAtMs` values — passed through
    // verbatim, never re-signed (this device does not hold the signing key that could).
    const signedPrekey = deviceMaterial.signedPrekey;
    signedPreKeyId = Number(signedPrekey.keyId);
    signedPreKeyPair = publicOnlyKeyPair(signedPrekey.publicKey);
    signedPreKeyExpiresAtMs = toDate(signedPrekey.expiresAt)?.getTime() ?? expiresAtMs;
    oneTimePreKeys = deviceMaterial.oneTimePrekeys.map((prekey) => ({
      id: Number(prekey.keyId),
      keyPair: publicOnlyKeyPair(prekey.publicKey),
    }));
    ownBundle = {
      bundleBytes: deviceMaterial.prekeyBundleBytes,
      deviceSignature: deviceMaterial.prekeyBundleSignature,
    };
  }

  const identity: LocalDeviceIdentity = {
    actorId: input.actorId,
    deviceId,
    keys: { signing, agreement },
    selfDevice,
    ownRoster,
    signedPreKey: {
      id: signedPreKeyId,
      keyPair: signedPreKeyPair,
      createdAtMs,
      expiresAtMs: signedPreKeyExpiresAtMs,
    },
    ownBundle,
    oneTimePreKeys,
  };

  const publishRootRequest: PublishIdentityRootRequest | undefined = bootstrap
    ? create(PublishIdentityRootRequestSchema, {
        identityRoot: buildIdentityRootWire(root),
      })
    : undefined;

  const record: StoredEnrollment = {
    submitted: false,
    createdRoot: bootstrap,
    rootPrivate: rootKeys.privateKey,
    rootPublic: rootKeys.publicKey,
    identity,
  };

  return { record, publishRootRequest, enrollRequest: buildEnrollRequest(identity) };
}

/** Exported for `device-link.ts`'s `rotateMessagingRoot` (ADR 0037 §2), which publishes a
 * self-signed root the same way bootstrap does — there is no second wire encoding to keep in
 * sync. */
export function buildIdentityRootWire(root: {
  readonly actorId: string;
  readonly generation: number;
  readonly publicKey: Uint8Array;
  readonly rootBytes: Uint8Array;
  readonly selfSignature: Uint8Array;
  readonly createdAtMs: number;
  readonly previousRootSignature?: Uint8Array | undefined;
}): E2eeIdentityRoot {
  return create(E2eeIdentityRootSchema, {
    actorId: root.actorId,
    generation: root.generation,
    publicKey: root.publicKey,
    rootBytes: root.rootBytes,
    selfSignature: root.selfSignature,
    previousRootSignature: root.previousRootSignature ?? new Uint8Array(0),
    createdAt: fromDate(new Date(root.createdAtMs)),
  });
}

/** Builds the wire `E2eeDeviceRoster` an already-verified `VerifiedRosterSnapshot` produces.
 * Exported for `device-link.ts`'s `rotateMessagingRoot` (ADR 0037 §2), which publishes the
 * roster S+1 it signs directly via `PublishIdentityRoot` rather than through `EnrollDevice` —
 * one encoding, two callers, per `buildIdentityRootWire`'s rationale above. */
export function buildRosterWire(roster: VerifiedRosterSnapshot): E2eeDeviceRoster {
  return create(E2eeDeviceRosterSchema, {
    actorId: roster.actorId,
    sequence: BigInt(roster.sequence),
    rootGeneration: roster.rootGeneration,
    previousDigest: roster.previousDigest,
    digest: roster.rosterDigest,
    rosterBytes: roster.rosterBytes,
    rootSignature: roster.rootSignature,
    entries: roster.entries.map((entry) => ({
      deviceId: entry.deviceId,
      certificateDigest: entry.certificateDigest,
      active: entry.active,
      addedAt: fromDate(new Date(entry.addedAtMs)),
      ...(entry.revokedAtMs === undefined
        ? {}
        : { revokedAt: fromDate(new Date(entry.revokedAtMs)) }),
    })),
    createdAt: fromDate(new Date(roster.createdAtMs)),
  });
}

/** Builds the `EnrollDeviceRequest` an identity's ALREADY-VERIFIED material produces.
 * The wire bytes are exactly the `@patches/crypto` transcript bytes (ADR 0033): there is
 * no second, node-canonical encoding to maintain in parallel. */
function buildEnrollRequest(identity: LocalDeviceIdentity): EnrollDeviceRequest {
  const certificate = identity.selfDevice;
  const roster = identity.ownRoster;
  return create(EnrollDeviceRequestSchema, {
    certificate: {
      actorId: certificate.actorId,
      deviceId: certificate.deviceId,
      rootGeneration: certificate.rootGeneration,
      certificateVersion: certificate.certificateVersion,
      signingPublicKey: certificate.signingPublicKey,
      agreementPublicKey: certificate.agreementPublicKey,
      supportedProtocolVersions: [...certificate.supportedProtocolVersions],
      createdAt: fromDate(new Date(certificate.createdAtMs)),
      expiresAt: fromDate(new Date(certificate.expiresAtMs)),
      certificateBytes: certificate.certificateBytes,
      rootSignature: certificate.rootSignature,
      certificateDigest: certificate.certificateDigest,
      status: E2eeDeviceStatus.ACTIVE,
    },
    roster: buildRosterWire(roster),
    signedPrekey: {
      keyId: BigInt(identity.signedPreKey.id),
      publicKey: identity.signedPreKey.keyPair.publicKey,
      signature: identity.ownBundle.deviceSignature,
      createdAt: fromDate(new Date(identity.signedPreKey.createdAtMs)),
      expiresAt: fromDate(new Date(identity.signedPreKey.expiresAtMs)),
    },
    oneTimePrekeys: identity.oneTimePreKeys.map((prekey) => ({
      keyId: BigInt(prekey.id),
      publicKey: prekey.keyPair.publicKey,
    })),
    prekeyBundleBytes: identity.ownBundle.bundleBytes,
    prekeyBundleSignature: identity.ownBundle.deviceSignature,
  });
}

/** Rebuilds the exact `EnrollDeviceRequest` a stored (not-yet-accepted) record produced,
 * so a crash between persist and accept resumes byte-identical material. */
export function enrollRequestFromRecord(record: StoredEnrollment): EnrollDeviceRequest {
  return buildEnrollRequest(record.identity);
}

/**
 * Rebuilds the byte-identical `PublishIdentityRootRequest` a stored bootstrap record
 * produced, so a crash (or failure) between persisting the record and publishing the root
 * republishes the same root instead of minting a second one. `undefined` for a record
 * that did not bootstrap the account root — there is nothing of ours to publish.
 */
export function publishRootRequestFromRecord(
  record: StoredEnrollment,
): PublishIdentityRootRequest | undefined {
  if (!record.createdRoot) return undefined;
  return create(PublishIdentityRootRequestSchema, {
    identityRoot: buildIdentityRootWire(record.identity.ownRoster.root),
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
  nowMs: number,
): Promise<StoredEnrollment | undefined> {
  const bytes = await vault.getOpaqueRecord(ENROLLMENT_RECORD_KEY);
  if (bytes === undefined) return undefined;
  try {
    return decodeStoredEnrollment(bytes, nowMs);
  } catch {
    // An undecodable (or no-longer-valid) identity record cannot be trusted for
    // enrollment purposes; treat it as absent rather than half-trusting it. Session
    // records remain governed by the ratchet store's own corruption handling.
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
      /** Capability-off only (ADR 0037 §2 moved the remote-root case to `needs-authority`,
       * which is a choice, not a dead end). */
      readonly status: 'refused';
      readonly reason: 'capability-off';
      readonly copy: string;
    }
  | {
      /** ADR 0037 §2: a published root exists that this device cannot reach. Not a dead
       * end — the caller offers exactly `options`, with fixed copy for each. */
      readonly status: 'needs-authority';
      readonly copy: string;
      readonly options: typeof NEEDS_AUTHORITY_OPTIONS;
    };

export interface EnrollThisDeviceInput {
  readonly actorId: string;
  readonly transport: EnrollmentTransport;
  readonly vault: RatchetSessionVault;
  readonly nowMs?: () => number;
}

/** Constant-time-ness is irrelevant here (both operands are public keys); this only has
 * to be an exact comparison rather than a reference one. */
function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Runs the enrollment flow idempotently. Safe to call again after any failure: either a
 * resumable record exists, or nothing was ever persisted. Transport failures propagate
 * untouched — the caller renders fixed copy, and the next attempt re-submits identical
 * material instead of minting orphan keys.
 *
 * B-131: a failed preflight is never read as an answer. `GetIdentityRoot` returning
 * `undefined` means the node said there is no root (the transport maps only `NOT_FOUND`
 * to absence); a network failure throws through here, so no identity root is minted, let
 * alone persisted, on the strength of a request that never completed. The remote check
 * runs on EVERY attempt, resumes included — a record persisted before an earlier failure
 * must still be reconciled against whatever the account publishes now.
 */
export async function enrollThisDevice(input: EnrollThisDeviceInput): Promise<EnrollOutcome> {
  const nowMs = input.nowMs ?? Date.now;
  const existing = await loadStoredEnrollment(input.vault, nowMs());
  if (existing !== undefined && existing.submitted) {
    return { status: 'already-enrolled', identity: existing.identity };
  }

  const capability = await input.transport.getCapability();
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

  const remoteRoot = await input.transport.getIdentityRoot(input.actorId);
  const publishedRoot =
    remoteRoot !== undefined && remoteRoot.publicKey.length > 0 ? remoteRoot : undefined;

  let record = existing;
  if (record === undefined) {
    if (publishedRoot !== undefined) {
      return {
        status: 'needs-authority',
        copy: NEEDS_AUTHORITY_COPY.summary,
        options: NEEDS_AUTHORITY_OPTIONS,
      };
    }
    const generated = generateEnrollment({ actorId: input.actorId, nowMs: nowMs() });
    // Durable BEFORE any network call, but strictly AFTER the remote check answered
    // (ADR 0020 §4): the node must never hold keys this device could lose in a crash,
    // and a retry reuses — never regenerates — them.
    await saveStoredEnrollment(input.vault, generated.record);
    record = generated.record;
    if (generated.publishRootRequest !== undefined) {
      await input.transport.publishIdentityRoot(generated.publishRootRequest);
    }
  } else if (publishedRoot === undefined) {
    // Resuming a record whose root never landed: republish the identical bootstrap root
    // rather than enrolling a device against an authority the node does not know.
    const republish = publishRootRequestFromRecord(record);
    if (republish !== undefined) await input.transport.publishIdentityRoot(republish);
  } else if (!sameBytes(publishedRoot.publicKey, record.rootPublic)) {
    // Another device published an authority key while this record sat unsubmitted; this
    // browser cannot enroll under it (ADR 0020 §2 — linking is recovery work).
    return {
      status: 'needs-authority',
      copy: NEEDS_AUTHORITY_COPY.summary,
      options: NEEDS_AUTHORITY_OPTIONS,
    };
  }

  await input.transport.enrollDevice(enrollRequestFromRecord(record));

  const submittedRecord: StoredEnrollment = { ...record, submitted: true };
  await saveStoredEnrollment(input.vault, submittedRecord);
  return {
    status: 'enrolled',
    identity: submittedRecord.identity,
    createdRoot: submittedRecord.createdRoot,
    rosterSequence: BigInt(submittedRecord.identity.ownRoster.sequence),
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
  if (record.rootPrivate !== undefined) zeroize(record.rootPrivate);
}
