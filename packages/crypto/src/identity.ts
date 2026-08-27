/**
 * Identity minting and verification over the one canonical transcript family (ADR 0033 §3).
 *
 * Every `verify*` takes raw bytes plus signatures plus an already-verified predecessor. There is
 * no field on any input type into which a caller could place its own decoding, honest or
 * otherwise: each verifier decodes the served bytes with the single codec, checks the signature
 * over exactly those bytes, checks the decoded view against the verified predecessor, checks the
 * validity window, and *returns* the re-derived fields.
 *
 * The results are branded with a module-private `unique symbol`, so no code outside this module
 * can construct one. `initiateX3dh`/`respondX3dh` accept only `Verified*` values, which makes
 * "run X3DH against unverified peer material" a compile error rather than a convention.
 *
 * Roster *chain* rules (sequence advances by exactly one, `previousDigest` chains, no drop, no
 * re-point, no un-revoke, no rollback) live in `@patches/domain`'s `assertRosterChain` and are
 * deliberately not duplicated here: one rule, one place.
 */
import { ByteWriter, bytesEqual, compareUtf8Bytes, toHex } from './codec.js';
import { CertificateError, PreKeyError } from './errors.js';
import {
  decodeDeviceCertificateTranscript,
  decodeDeviceRosterTranscript,
  decodeMessagingRootTranscript,
  decodePreKeyBundleTranscript,
  encodeDeviceCertificateTranscript,
  encodeDeviceRosterTranscript,
  encodeMessagingRootTranscript,
  encodePreKeyBundleTranscript,
  type DeviceCertificateTranscript,
  type DeviceRosterEntryTranscript,
  type DeviceRosterTranscript,
  type MessagingRootTranscript,
  type PreKeyBundleTranscript,
} from './identity-transcript.js';
import { sha256Hash, sign, verifyStrict } from './primitives.js';
import { KEY_BYTES, SIGNATURE_BYTES, type OneTimePreKey } from './types.js';

const SAFETY_NUMBER_CONTEXT = 'patches-e2ee-v1/safety-number';

/**
 * Phantom brand. `declare const` means it exists only in the type system, so a `Verified*` value
 * is an ordinary object at runtime that only this module's verifiers can produce a *typed*
 * reference to — the property name is unnameable outside this file.
 */
declare const VERIFIED_IDENTITY_BRAND: unique symbol;

/**
 * The shape a verifier actually builds: every field of the branded result except the phantom
 * brand, which has no runtime representation to build. The four `brand*` helpers below are the
 * only places the brand is attached, and each is a concrete (non-generic) assertion from a fully
 * checked value — so a verifier that forgets a field or gets one's type wrong is still a compile
 * error at the call site rather than being swallowed by a wide cast.
 */
type Unbranded<T extends { readonly [VERIFIED_IDENTITY_BRAND]: string }> = Omit<
  T,
  typeof VERIFIED_IDENTITY_BRAND
>;

function brandMessagingRoot(value: Unbranded<VerifiedMessagingRoot>): VerifiedMessagingRoot {
  return value as VerifiedMessagingRoot;
}

function brandCertifiedDevice(value: Unbranded<VerifiedCertifiedDevice>): VerifiedCertifiedDevice {
  return value as VerifiedCertifiedDevice;
}

function brandRosterSnapshot(value: Unbranded<VerifiedRosterSnapshot>): VerifiedRosterSnapshot {
  return value as VerifiedRosterSnapshot;
}

function brandPreKeyBundle(value: Unbranded<VerifiedPreKeyBundle>): VerifiedPreKeyBundle {
  return value as VerifiedPreKeyBundle;
}

function requireSignatureBytes(value: Uint8Array, label: string): void {
  if (value.length !== SIGNATURE_BYTES) {
    throw new CertificateError(`${label} has an invalid length.`);
  }
}

function requireKeyLength(value: Uint8Array, label: string): void {
  if (value.length !== KEY_BYTES) throw new CertificateError(`${label} has an invalid length.`);
}

const identifierUtf8Encoder = new TextEncoder();

function requireIdentifier(value: string, label: string): void {
  // UTF-8 byte bound, matching the transcript codec's `requireIdentifier` (256 bytes,
  // not 256 UTF-16 code units — see `identity-transcript.ts` for why).
  const bytes = identifierUtf8Encoder.encode(value);
  if (bytes.byteLength === 0 || bytes.byteLength > 256) {
    throw new CertificateError(`${label} is invalid.`);
  }
}

/** SHA-256 over a canonical identity transcript; this is what roster entries reference. */
export function identityTranscriptDigest(transcriptBytes: Uint8Array): Uint8Array {
  return sha256Hash(transcriptBytes);
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

export interface SignedMessagingRoot {
  readonly rootBytes: Uint8Array;
  readonly selfSignature: Uint8Array;
}

export function signMessagingRoot(
  rootPrivateKey: Uint8Array,
  fields: MessagingRootTranscript,
): SignedMessagingRoot {
  const rootBytes = encodeMessagingRootTranscript(fields);
  return { rootBytes, selfSignature: sign(rootPrivateKey, rootBytes) };
}

/** The additional signature a *previous* root produces over a planned rotation's new root bytes. */
export function countersignMessagingRoot(
  previousRootPrivateKey: Uint8Array,
  rootBytes: Uint8Array,
): Uint8Array {
  return sign(previousRootPrivateKey, rootBytes);
}

export interface SignedDeviceCertificate {
  readonly certificateBytes: Uint8Array;
  readonly rootSignature: Uint8Array;
  readonly certificateDigest: Uint8Array;
}

export function signDeviceCertificate(
  rootPrivateKey: Uint8Array,
  fields: DeviceCertificateTranscript,
): SignedDeviceCertificate {
  const certificateBytes = encodeDeviceCertificateTranscript(fields);
  return {
    certificateBytes,
    rootSignature: sign(rootPrivateKey, certificateBytes),
    certificateDigest: identityTranscriptDigest(certificateBytes),
  };
}

export interface SignedDeviceRoster {
  readonly rosterBytes: Uint8Array;
  readonly rootSignature: Uint8Array;
  readonly rosterDigest: Uint8Array;
}

export function signDeviceRoster(
  rootPrivateKey: Uint8Array,
  fields: DeviceRosterTranscript,
): SignedDeviceRoster {
  const rosterBytes = encodeDeviceRosterTranscript(fields);
  return {
    rosterBytes,
    rootSignature: sign(rootPrivateKey, rosterBytes),
    rosterDigest: identityTranscriptDigest(rosterBytes),
  };
}

export interface SignedPreKeyBundle {
  readonly bundleBytes: Uint8Array;
  readonly deviceSignature: Uint8Array;
}

export function signPreKeyBundle(
  deviceSigningPrivateKey: Uint8Array,
  fields: PreKeyBundleTranscript,
): SignedPreKeyBundle {
  const bundleBytes = encodePreKeyBundleTranscript(fields);
  return { bundleBytes, deviceSignature: sign(deviceSigningPrivateKey, bundleBytes) };
}

// ---------------------------------------------------------------------------
// Verified results
// ---------------------------------------------------------------------------

export interface VerifiedMessagingRoot extends MessagingRootTranscript {
  readonly [VERIFIED_IDENTITY_BRAND]: 'messaging-root';
  readonly rootBytes: Uint8Array;
  readonly selfSignature: Uint8Array;
  /** Present only when a planned rotation was countersigned by the verified previous root. */
  readonly previousRootSignature?: Uint8Array | undefined;
}

export interface VerifiedCertifiedDevice extends DeviceCertificateTranscript {
  readonly [VERIFIED_IDENTITY_BRAND]: 'certified-device';
  readonly certificateBytes: Uint8Array;
  readonly rootSignature: Uint8Array;
  readonly certificateDigest: Uint8Array;
}

export interface VerifiedRosterSnapshot extends DeviceRosterTranscript {
  readonly [VERIFIED_IDENTITY_BRAND]: 'roster-snapshot';
  readonly rosterBytes: Uint8Array;
  readonly rootSignature: Uint8Array;
  readonly rosterDigest: Uint8Array;
  readonly root: VerifiedMessagingRoot;
  /** The served certificates, each verified against `root` and matched to an entry by digest. */
  readonly devices: readonly VerifiedCertifiedDevice[];
}

export interface VerifiedPreKeyBundle extends PreKeyBundleTranscript {
  readonly [VERIFIED_IDENTITY_BRAND]: 'prekey-bundle';
  readonly bundleBytes: Uint8Array;
  readonly deviceSignature: Uint8Array;
  readonly device: VerifiedCertifiedDevice;
  /** Digest of the roster this bundle's certificate was proved to be an active entry of. */
  readonly rosterDigest: Uint8Array;
  readonly oneTimePreKey?: OneTimePreKey | undefined;
}

// ---------------------------------------------------------------------------
// Verifiers
// ---------------------------------------------------------------------------

export interface VerifyMessagingRootInput {
  readonly rootBytes: Uint8Array;
  readonly selfSignature: Uint8Array;
  /**
   * A planned rotation is additionally signed by the previous root over the same bytes. ADR 0033
   * §3 lists only `previousRootSignature`, but a signature is uncheckable without the key that
   * made it, and silently accepting an unchecked one would be worse than not taking it at all —
   * so the already-verified predecessor root travels with it and the pair is all-or-nothing.
   */
  readonly previousRootSignature?: Uint8Array | undefined;
  readonly previousRoot?: VerifiedMessagingRoot | undefined;
  readonly nowMs: number;
}

export function verifyMessagingRoot(input: VerifyMessagingRootInput): VerifiedMessagingRoot {
  const fields = decodeMessagingRootTranscript(input.rootBytes);
  requireSignatureBytes(input.selfSignature, 'Messaging root self signature');
  if (!verifyStrict(fields.publicKey, input.rootBytes, input.selfSignature)) {
    throw new CertificateError('Messaging root self signature is invalid.');
  }
  if (input.nowMs < fields.createdAtMs) {
    throw new CertificateError('Messaging root is not yet valid.');
  }
  if ((input.previousRootSignature === undefined) !== (input.previousRoot === undefined)) {
    throw new CertificateError('A previous-root signature requires the verified previous root.');
  }
  if (input.previousRootSignature !== undefined && input.previousRoot !== undefined) {
    requireSignatureBytes(input.previousRootSignature, 'Previous root signature');
    if (
      input.previousRoot.actorId !== fields.actorId ||
      fields.generation !== input.previousRoot.generation + 1 ||
      bytesEqual(fields.publicKey, input.previousRoot.publicKey)
    ) {
      throw new CertificateError('Messaging root does not extend the previous root.');
    }
    if (!verifyStrict(input.previousRoot.publicKey, input.rootBytes, input.previousRootSignature)) {
      throw new CertificateError('Previous-root signature is invalid.');
    }
  }
  return brandMessagingRoot({
    ...fields,
    rootBytes: input.rootBytes,
    selfSignature: input.selfSignature,
    ...(input.previousRootSignature === undefined
      ? {}
      : { previousRootSignature: input.previousRootSignature }),
  });
}

export interface VerifyCertifiedDeviceInput {
  readonly certificateBytes: Uint8Array;
  readonly rootSignature: Uint8Array;
  readonly root: VerifiedMessagingRoot;
  readonly nowMs: number;
}

export function verifyCertifiedDevice(input: VerifyCertifiedDeviceInput): VerifiedCertifiedDevice {
  const fields = decodeDeviceCertificateTranscript(input.certificateBytes);
  requireSignatureBytes(input.rootSignature, 'Certificate root signature');
  if (!verifyStrict(input.root.publicKey, input.certificateBytes, input.rootSignature)) {
    throw new CertificateError('Device certificate signature is invalid.');
  }
  if (
    fields.actorId !== input.root.actorId ||
    fields.rootGeneration !== input.root.generation ||
    !bytesEqual(fields.rootPublicKey, input.root.publicKey)
  ) {
    throw new CertificateError('Device certificate does not bind the verified messaging root.');
  }
  if (input.nowMs < fields.createdAtMs || input.nowMs >= fields.expiresAtMs) {
    throw new CertificateError('Device certificate is not currently valid.');
  }
  return brandCertifiedDevice({
    ...fields,
    certificateBytes: input.certificateBytes,
    rootSignature: input.rootSignature,
    certificateDigest: identityTranscriptDigest(input.certificateBytes),
  });
}

export interface VerifyRosterSnapshotInput {
  readonly rosterBytes: Uint8Array;
  readonly rootSignature: Uint8Array;
  readonly root: VerifiedMessagingRoot;
  /**
   * T3 commits to certificates by digest only, so the served certificates are supplied here and
   * re-verified. Every *active* entry must be matched by exactly one supplied certificate whose
   * SHA-256 equals the entry's digest; a supplied certificate matching no entry is rejected; an
   * inactive entry may be unmatched, since the node need not still serve a revoked device's
   * certificate.
   */
  readonly certificates: readonly {
    readonly certificateBytes: Uint8Array;
    readonly rootSignature: Uint8Array;
  }[];
  readonly nowMs: number;
}

export function verifyRosterSnapshot(input: VerifyRosterSnapshotInput): VerifiedRosterSnapshot {
  const fields = decodeDeviceRosterTranscript(input.rosterBytes);
  requireSignatureBytes(input.rootSignature, 'Roster root signature');
  if (!verifyStrict(input.root.publicKey, input.rosterBytes, input.rootSignature)) {
    throw new CertificateError('Roster signature is invalid.');
  }
  if (
    fields.actorId !== input.root.actorId ||
    fields.rootGeneration !== input.root.generation ||
    !bytesEqual(fields.rootPublicKey, input.root.publicKey)
  ) {
    throw new CertificateError('Roster does not bind the verified messaging root.');
  }
  if (input.nowMs < fields.createdAtMs) {
    throw new CertificateError('Roster is not yet valid.');
  }

  const entriesByDigest = new Map<string, DeviceRosterEntryTranscript>();
  for (const entry of fields.entries) entriesByDigest.set(toHex(entry.certificateDigest), entry);

  const devices: VerifiedCertifiedDevice[] = [];
  const suppliedDigests = new Set<string>();
  for (const supplied of input.certificates) {
    const device = verifyCertifiedDevice({
      certificateBytes: supplied.certificateBytes,
      rootSignature: supplied.rootSignature,
      root: input.root,
      nowMs: input.nowMs,
    });
    const key = toHex(device.certificateDigest);
    if (suppliedDigests.has(key)) {
      throw new CertificateError('The same device certificate was supplied twice.');
    }
    const entry = entriesByDigest.get(key);
    if (entry === undefined) {
      throw new CertificateError('A supplied device certificate matches no roster entry.');
    }
    if (entry.deviceId !== device.deviceId) {
      throw new CertificateError('A roster entry names a different device than its certificate.');
    }
    suppliedDigests.add(key);
    devices.push(device);
  }
  for (const entry of fields.entries) {
    if (entry.active && !suppliedDigests.has(toHex(entry.certificateDigest))) {
      throw new CertificateError('An active roster entry has no matching device certificate.');
    }
  }

  return brandRosterSnapshot({
    ...fields,
    rosterBytes: input.rosterBytes,
    rootSignature: input.rootSignature,
    rosterDigest: identityTranscriptDigest(input.rosterBytes),
    root: input.root,
    devices,
  });
}

/** True when `certificateDigest` is an **active** entry of the verified roster snapshot. */
export function rosterHasActiveCertificate(
  roster: VerifiedRosterSnapshot,
  certificateDigest: Uint8Array,
): boolean {
  return roster.entries.some(
    (entry) => entry.active && bytesEqual(entry.certificateDigest, certificateDigest),
  );
}

export interface VerifyPreKeyBundleInput {
  readonly bundleBytes: Uint8Array;
  readonly deviceSignature: Uint8Array;
  readonly certificateBytes: Uint8Array;
  readonly certificateRootSignature: Uint8Array;
  readonly oneTimePreKey?: OneTimePreKey | undefined;
  readonly roster: VerifiedRosterSnapshot;
  readonly nowMs: number;
}

export function verifyPreKeyBundle(input: VerifyPreKeyBundleInput): VerifiedPreKeyBundle {
  const device = verifyCertifiedDevice({
    certificateBytes: input.certificateBytes,
    rootSignature: input.certificateRootSignature,
    root: input.roster.root,
    nowMs: input.nowMs,
  });
  const fields = decodePreKeyBundleTranscript(input.bundleBytes);
  requireSignatureBytes(input.deviceSignature, 'Prekey bundle signature');
  if (!verifyStrict(device.signingPublicKey, input.bundleBytes, input.deviceSignature)) {
    throw new PreKeyError('Prekey bundle signature is invalid.');
  }
  if (
    fields.actorId !== device.actorId ||
    fields.deviceId !== device.deviceId ||
    !bytesEqual(fields.certificateDigest, device.certificateDigest)
  ) {
    throw new PreKeyError('Prekey bundle does not bind the verified device certificate.');
  }
  if (fields.actorId !== input.roster.actorId) {
    throw new PreKeyError('Prekey bundle belongs to another actor than the verified roster.');
  }
  if (!rosterHasActiveCertificate(input.roster, fields.certificateDigest)) {
    throw new PreKeyError('Prekey device is not an active entry of the verified roster.');
  }
  if (input.nowMs < fields.createdAtMs || input.nowMs >= fields.expiresAtMs) {
    throw new PreKeyError('Signed prekey is not currently valid.');
  }
  if (input.oneTimePreKey !== undefined) {
    if (!Number.isSafeInteger(input.oneTimePreKey.id) || input.oneTimePreKey.id < 1) {
      throw new PreKeyError('One-time prekey id is invalid.');
    }
    if (input.oneTimePreKey.publicKey.length !== KEY_BYTES) {
      throw new PreKeyError('One-time prekey has an invalid length.');
    }
  }
  return brandPreKeyBundle({
    ...fields,
    bundleBytes: input.bundleBytes,
    deviceSignature: input.deviceSignature,
    device,
    rosterDigest: input.roster.rosterDigest,
    ...(input.oneTimePreKey === undefined ? {} : { oneTimePreKey: input.oneTimePreKey }),
  });
}

/** Stable 60-digit root-key fingerprint; clients display it in twelve groups of five. */
export function safetyNumber(
  firstUserId: string,
  firstRootPublicKey: Uint8Array,
  secondUserId: string,
  secondRootPublicKey: Uint8Array,
): string {
  requireIdentifier(firstUserId, 'First user id');
  requireIdentifier(secondUserId, 'Second user id');
  requireKeyLength(firstRootPublicKey, 'First root public key');
  requireKeyLength(secondRootPublicKey, 'Second root public key');
  const ordered = [
    { id: firstUserId, key: firstRootPublicKey },
    { id: secondUserId, key: secondRootPublicKey },
  ].sort((left, right) => compareUtf8Bytes(left.id, right.id));
  const first = ordered[0];
  const second = ordered[1];
  if (first === undefined || second === undefined)
    throw new CertificateError('Safety input failed.');
  let digest = sha256Hash(
    new ByteWriter()
      .string(SAFETY_NUMBER_CONTEXT)
      .string(first.id)
      .fixed(first.key, KEY_BYTES)
      .string(second.id)
      .fixed(second.key, KEY_BYTES)
      .finish(),
  );
  for (let iteration = 1; iteration < 5_200; iteration += 1) digest = sha256Hash(digest);
  let digits = '';
  for (let offset = 0; offset < 30; offset += 5) {
    const value = new DataView(digest.buffer, digest.byteOffset + offset, 5).getUint32(1, false);
    digits += value.toString().padStart(10, '0').slice(-10);
  }
  return digits;
}
