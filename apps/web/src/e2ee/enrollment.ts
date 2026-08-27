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
  type E2eeIdentityRoot,
  type PublishIdentityRootRequest,
} from '@patches/proto/es';

import { fromDate } from './wire-time.js';
import type { LocalDeviceIdentity, LocalOneTimePreKey } from './local-identity.js';
import type { RatchetSessionVault } from './vault.js';

/** Certificate validity window (ADR 0020 §2 leaves the cadence to clients; 30 days keeps
 * renewal a routine, root-signed roster bump rather than an identity event). */
const CERTIFICATE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
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
  remoteRoot:
    'This account already has a messaging identity published from another device, and this ' +
    'browser does not hold its authority key. Linking an existing identity is not available ' +
    'yet — enroll from the device that set it up.',
} as const;

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

/** Reserved vault record key. The leading NUL cannot occur in a real session id
 * (`sessionIdFor` composes UUID conversation ids), so the runtime can never collide. */
export const ENROLLMENT_RECORD_KEY = '\0patches-e2ee-enrollment';

export interface StoredEnrollment {
  /** True once `EnrollDevice` resolved successfully at least once. */
  readonly submitted: boolean;
  /** True when this device bootstrapped the account root (`PublishIdentityRoot` gen 1). */
  readonly createdRoot: boolean;
  readonly rootPrivate: Uint8Array;
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
export function encodeStoredEnrollment(record: StoredEnrollment): Uint8Array {
  const identity = record.identity;
  const root = identity.ownRoster.root;
  const writer = new ByteWriter()
    .u8(1)
    .u8(record.submitted ? 1 : 0)
    .u8(record.createdRoot ? 1 : 0)
    .fixed(record.rootPrivate, KEY_BYTES)
    .fixed(record.rootPublic, KEY_BYTES);
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
  return writer.finish();
}

/** Reconstructs a `StoredEnrollment`, re-verifying every transcript against `nowMs`
 * exactly as a peer receiving this device's published material would (ADR 0033 §3). */
export function decodeStoredEnrollment(bytes: Uint8Array, nowMs: number): StoredEnrollment {
  const reader = new ByteReader(bytes);
  const version = reader.u8();
  if (version !== 1) throw new Error('Unsupported enrollment record version.');
  const submitted = reader.u8() === 1;
  const createdRoot = reader.u8() === 1;
  const rootPrivate = reader.fixed(KEY_BYTES);
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
    certificates: [{ certificateBytes, rootSignature: certificateRootSignature }],
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
  readonly nowMs: number;
}

export interface GeneratedEnrollment {
  readonly record: StoredEnrollment;
  readonly publishRootRequest: PublishIdentityRootRequest | undefined;
  readonly enrollRequest: EnrollDeviceRequest;
}

function randomDeviceId(): string {
  // UUID-shaped per the node's DEVICE_ID_PATTERN (`[0-9a-f-]{8,64}`); random per ADR
  // 0020 §2 ("not derived from hardware, an account id, or a key"). `randomBytes` is
  // `@noble/ciphers/utils`' browser-safe source (`crypto.getRandomValues`).
  const hex: string[] = [];
  for (const byte of randomBytes(16)) hex.push(byte.toString(16).padStart(2, '0'));
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 32)}`;
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
  const createdAtMs = Math.max(0, nowMs - 1000);
  const expiresAtMs = createdAtMs + CERTIFICATE_LIFETIME_MS;

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

  const signing = generateSigningKeyPair();
  const agreement = generateKeyAgreementKeyPair();
  const deviceId = randomDeviceId();
  const supportedVersions = [E2EE_PROTOCOL_V1];

  const signedCertificate = signDeviceCertificate(rootKeys.privateKey, {
    actorId: input.actorId,
    deviceId,
    rootGeneration,
    rootPublicKey: rootKeys.publicKey,
    certificateVersion: E2EE_DEVICE_CERTIFICATE_VERSION,
    signingPublicKey: signing.publicKey,
    agreementPublicKey: agreement.publicKey,
    supportedProtocolVersions: supportedVersions,
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

  const signedPreKeyId = 1;
  const signedPreKeyPair = generateKeyAgreementKeyPair();
  const signedPreKeyExpiresAtMs = createdAtMs + SIGNED_PREKEY_LIFETIME_MS;
  const signedBundle = signPreKeyBundle(signing.privateKey, {
    actorId: input.actorId,
    deviceId,
    certificateDigest: signedCertificate.certificateDigest,
    signedPrekeyId: signedPreKeyId,
    signedPrekeyPublicKey: signedPreKeyPair.publicKey,
    createdAtMs,
    expiresAtMs: signedPreKeyExpiresAtMs,
  });

  const oneTimePreKeys: LocalOneTimePreKey[] = Array.from(
    { length: INITIAL_ONE_TIME_PREKEY_COUNT },
    (_, index) => ({ id: index + 1, keyPair: generateKeyAgreementKeyPair() }),
  );

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
    ownBundle: {
      bundleBytes: signedBundle.bundleBytes,
      deviceSignature: signedBundle.deviceSignature,
    },
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

function buildIdentityRootWire(root: {
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
    roster: {
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
    },
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
      return { status: 'refused', reason: 'remote-root', copy: ENROLLMENT_REFUSAL_COPY.remoteRoot };
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
    return { status: 'refused', reason: 'remote-root', copy: ENROLLMENT_REFUSAL_COPY.remoteRoot };
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
  zeroize(record.rootPrivate);
}
