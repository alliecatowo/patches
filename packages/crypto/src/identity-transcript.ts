/**
 * The single canonical identity transcript family (ADR 0033 §2). Every process that signs, stores,
 * serves, or verifies a messaging root, device certificate, device roster, or prekey bundle uses
 * *this* encoder and *this* decoder — there is no second encoding of the same facts anywhere in
 * the monorepo, so "the served decoding disagrees with the signed bytes" is not representable.
 *
 * One set of facts has exactly one valid encoding: the encoder and the decoder enforce the same
 * constraints, so a decoder that reads a non-ascending ordering, a duplicate, an out-of-range
 * integer, a boolean byte outside `{0,1}`, a wrong domain/version/tag, or trailing bytes fails
 * closed rather than accepting bytes the encoder could never have produced.
 */
import { ByteReader, ByteWriter, bytesEqual, compareUtf8Bytes } from './codec.js';
import { MalformedInputError } from './errors.js';
import { KEY_BYTES } from './types.js';

/** Domain separator shared by all four identity transcripts; the tag byte differentiates them. */
export const E2EE_IDENTITY_TRANSCRIPT_DOMAIN = 'patches-e2ee/identity-v1';
export const E2EE_IDENTITY_TRANSCRIPT_VERSION = 1;

/**
 * One domain string plus an enumerated tag at a fixed offset makes cross-type confusion
 * impossible by construction: no two transcript types can produce the same bytes, and the prefix
 * is written by one shared helper so a new transcript type cannot forget to differentiate itself.
 */
export const E2EE_IDENTITY_TRANSCRIPT_TAGS = {
  messagingRoot: 1,
  deviceCertificate: 2,
  deviceRoster: 3,
  preKeyBundle: 4,
} as const;

export type E2eeIdentityTranscriptTag =
  (typeof E2EE_IDENTITY_TRANSCRIPT_TAGS)[keyof typeof E2EE_IDENTITY_TRANSCRIPT_TAGS];

const MAX_IDENTIFIER_BYTES = 256;

const utf8Encoder = new TextEncoder();

function requireIdentifier(value: string, label: string): void {
  // Bounded by UTF-8 bytes, not UTF-16 code units: the bound exists so a transcript's
  // worst-case encoded size is known, and `value.length` would under-count astral
  // characters (2 code units, up to 4 bytes) — an identifier up to 256 *code units*
  // of 4-byte characters would encode to 512 bytes.
  const bytes = utf8Encoder.encode(value);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IDENTIFIER_BYTES) {
    throw new MalformedInputError(`${label} is invalid.`);
  }
}

function requireKeyBytes(value: Uint8Array, label: string): void {
  if (value.length !== KEY_BYTES) {
    throw new MalformedInputError(`${label} must be exactly ${String(KEY_BYTES)} bytes.`);
  }
}

function requireTimestampMs(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MalformedInputError(`${label} is not a valid millisecond timestamp.`);
  }
}

function requireValidityWindow(createdAtMs: number, expiresAtMs: number, label: string): void {
  requireTimestampMs(createdAtMs, `${label} createdAtMs`);
  requireTimestampMs(expiresAtMs, `${label} expiresAtMs`);
  if (expiresAtMs <= createdAtMs) {
    throw new MalformedInputError(`${label} validity window is not strictly positive.`);
  }
}

function requirePositiveCounter(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new MalformedInputError(`${label} must be a positive integer.`);
  }
}

/** Reads a boolean that was written as a single byte, rejecting anything outside `{0,1}`. */
function readBooleanByte(reader: ByteReader, label: string): boolean {
  const value = reader.u8();
  if (value !== 0 && value !== 1) {
    throw new MalformedInputError(`${label} is not a canonical boolean byte.`);
  }
  return value === 1;
}

function requireStrictlyAscending(values: readonly string[], label: string): void {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined) continue;
    const order = compareUtf8Bytes(previous, current);
    if (order === 0) throw new MalformedInputError(`${label} contains a duplicate.`);
    if (order > 0) throw new MalformedInputError(`${label} is not sorted by UTF-8 byte order.`);
  }
}

/** Sorts strings into the strictly-ascending UTF-8 byte order the encoder demands. */
export function sortByUtf8Bytes(values: readonly string[]): readonly string[] {
  return [...values].sort(compareUtf8Bytes);
}

function beginTranscript(tag: E2eeIdentityTranscriptTag): ByteWriter {
  return new ByteWriter()
    .string(E2EE_IDENTITY_TRANSCRIPT_DOMAIN)
    .u8(E2EE_IDENTITY_TRANSCRIPT_VERSION)
    .u8(tag);
}

function beginRead(bytes: Uint8Array, tag: E2eeIdentityTranscriptTag): ByteReader {
  const reader = new ByteReader(bytes);
  if (reader.string() !== E2EE_IDENTITY_TRANSCRIPT_DOMAIN) {
    throw new MalformedInputError('Identity transcript has the wrong domain separator.');
  }
  if (reader.u8() !== E2EE_IDENTITY_TRANSCRIPT_VERSION) {
    throw new MalformedInputError('Identity transcript has an unsupported version.');
  }
  if (reader.u8() !== tag) {
    throw new MalformedInputError('Identity transcript has the wrong type tag.');
  }
  return reader;
}

/** T1 — messaging identity root (tag 1), signed by the root key itself. */
export interface MessagingRootTranscript {
  readonly actorId: string;
  readonly generation: number;
  readonly publicKey: Uint8Array;
  readonly createdAtMs: number;
}

function assertMessagingRoot(fields: MessagingRootTranscript): void {
  requireIdentifier(fields.actorId, 'Messaging root actorId');
  requirePositiveCounter(fields.generation, 'Messaging root generation');
  requireKeyBytes(fields.publicKey, 'Messaging root public key');
  requireTimestampMs(fields.createdAtMs, 'Messaging root createdAtMs');
}

export function encodeMessagingRootTranscript(fields: MessagingRootTranscript): Uint8Array {
  assertMessagingRoot(fields);
  return beginTranscript(E2EE_IDENTITY_TRANSCRIPT_TAGS.messagingRoot)
    .string(fields.actorId)
    .u32(fields.generation)
    .fixed(fields.publicKey, KEY_BYTES)
    .u64(fields.createdAtMs)
    .finish();
}

export function decodeMessagingRootTranscript(bytes: Uint8Array): MessagingRootTranscript {
  const reader = beginRead(bytes, E2EE_IDENTITY_TRANSCRIPT_TAGS.messagingRoot);
  const actorId = reader.string();
  const generation = reader.u32();
  const publicKey = reader.fixed(KEY_BYTES);
  const createdAtMs = reader.u64();
  reader.end();
  const fields: MessagingRootTranscript = { actorId, generation, publicKey, createdAtMs };
  assertMessagingRoot(fields);
  return fields;
}

/** T2 — device certificate (tag 2), signed by the messaging root. */
export interface DeviceCertificateTranscript {
  readonly actorId: string;
  readonly deviceId: string;
  readonly rootGeneration: number;
  /** The exact root key that must have signed this certificate. */
  readonly rootPublicKey: Uint8Array;
  readonly certificateVersion: number;
  readonly signingPublicKey: Uint8Array;
  readonly agreementPublicKey: Uint8Array;
  /** Strictly ascending by UTF-8 bytes; see {@link sortByUtf8Bytes}. */
  readonly supportedProtocolVersions: readonly string[];
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

function assertDeviceCertificate(fields: DeviceCertificateTranscript): void {
  requireIdentifier(fields.actorId, 'Certificate actorId');
  requireIdentifier(fields.deviceId, 'Certificate deviceId');
  requirePositiveCounter(fields.rootGeneration, 'Certificate rootGeneration');
  requireKeyBytes(fields.rootPublicKey, 'Certificate rootPublicKey');
  requirePositiveCounter(fields.certificateVersion, 'Certificate version');
  requireKeyBytes(fields.signingPublicKey, 'Certificate signingPublicKey');
  requireKeyBytes(fields.agreementPublicKey, 'Certificate agreementPublicKey');
  requireStrictlyAscending(fields.supportedProtocolVersions, 'Supported protocol versions');
  requireValidityWindow(fields.createdAtMs, fields.expiresAtMs, 'Certificate');
}

export function encodeDeviceCertificateTranscript(fields: DeviceCertificateTranscript): Uint8Array {
  assertDeviceCertificate(fields);
  const writer = beginTranscript(E2EE_IDENTITY_TRANSCRIPT_TAGS.deviceCertificate)
    .string(fields.actorId)
    .string(fields.deviceId)
    .u32(fields.rootGeneration)
    .fixed(fields.rootPublicKey, KEY_BYTES)
    .u32(fields.certificateVersion)
    .fixed(fields.signingPublicKey, KEY_BYTES)
    .fixed(fields.agreementPublicKey, KEY_BYTES)
    .u32(fields.supportedProtocolVersions.length);
  for (const version of fields.supportedProtocolVersions) writer.string(version);
  return writer.u64(fields.createdAtMs).u64(fields.expiresAtMs).finish();
}

export function decodeDeviceCertificateTranscript(bytes: Uint8Array): DeviceCertificateTranscript {
  const reader = beginRead(bytes, E2EE_IDENTITY_TRANSCRIPT_TAGS.deviceCertificate);
  const actorId = reader.string();
  const deviceId = reader.string();
  const rootGeneration = reader.u32();
  const rootPublicKey = reader.fixed(KEY_BYTES);
  const certificateVersion = reader.u32();
  const signingPublicKey = reader.fixed(KEY_BYTES);
  const agreementPublicKey = reader.fixed(KEY_BYTES);
  const versionCount = reader.u32();
  const supportedProtocolVersions: string[] = [];
  for (let index = 0; index < versionCount; index += 1) {
    supportedProtocolVersions.push(reader.string());
  }
  const createdAtMs = reader.u64();
  const expiresAtMs = reader.u64();
  reader.end();
  const fields: DeviceCertificateTranscript = {
    actorId,
    deviceId,
    rootGeneration,
    rootPublicKey,
    certificateVersion,
    signingPublicKey,
    agreementPublicKey,
    supportedProtocolVersions,
    createdAtMs,
    expiresAtMs,
  };
  assertDeviceCertificate(fields);
  return fields;
}

/** One entry of T3. `revokedAtMs` absent is encoded as `hasRevokedAt = 0`, `revokedAtMs = 0`. */
export interface DeviceRosterEntryTranscript {
  readonly deviceId: string;
  readonly certificateDigest: Uint8Array;
  readonly active: boolean;
  readonly addedAtMs: number;
  readonly revokedAtMs?: number | undefined;
}

/** T3 — device roster (tag 3), signed by the messaging root. */
export interface DeviceRosterTranscript {
  readonly actorId: string;
  readonly rootGeneration: number;
  readonly rootPublicKey: Uint8Array;
  readonly sequence: number;
  /** All-zero at sequence 1. */
  readonly previousDigest: Uint8Array;
  readonly createdAtMs: number;
  /** Strictly ascending by `deviceId` UTF-8 bytes; see {@link sortRosterEntries}. */
  readonly entries: readonly DeviceRosterEntryTranscript[];
}

/** Sorts roster entries into the strictly-ascending device-id byte order the encoder demands. */
export function sortRosterEntries(
  entries: readonly DeviceRosterEntryTranscript[],
): readonly DeviceRosterEntryTranscript[] {
  return [...entries].sort((left, right) => compareUtf8Bytes(left.deviceId, right.deviceId));
}

function assertDeviceRoster(fields: DeviceRosterTranscript): void {
  requireIdentifier(fields.actorId, 'Roster actorId');
  requirePositiveCounter(fields.rootGeneration, 'Roster rootGeneration');
  requireKeyBytes(fields.rootPublicKey, 'Roster rootPublicKey');
  requirePositiveCounter(fields.sequence, 'Roster sequence');
  requireKeyBytes(fields.previousDigest, 'Roster previousDigest');
  // T3's documented layout (ADR 0033 §2): sequence 1 is the roster's genesis, so it has no
  // prior digest to chain from — `previousDigest` must be all-zero. Enforced here because
  // this function runs on both encode and decode, so a decoder can never accept bytes the
  // encoder's own contract forbids.
  if (fields.sequence === 1 && !bytesEqual(fields.previousDigest, new Uint8Array(KEY_BYTES))) {
    throw new MalformedInputError('Roster previousDigest must be all-zero at sequence 1.');
  }
  requireTimestampMs(fields.createdAtMs, 'Roster createdAtMs');
  requireStrictlyAscending(
    fields.entries.map((entry) => entry.deviceId),
    'Roster device ids',
  );
  for (const entry of fields.entries) {
    requireIdentifier(entry.deviceId, 'Roster entry deviceId');
    requireKeyBytes(entry.certificateDigest, 'Roster entry certificateDigest');
    requireTimestampMs(entry.addedAtMs, 'Roster entry addedAtMs');
    if (entry.revokedAtMs !== undefined) {
      requireTimestampMs(entry.revokedAtMs, 'Roster entry revokedAtMs');
    }
  }
}

export function encodeDeviceRosterTranscript(fields: DeviceRosterTranscript): Uint8Array {
  assertDeviceRoster(fields);
  const writer = beginTranscript(E2EE_IDENTITY_TRANSCRIPT_TAGS.deviceRoster)
    .string(fields.actorId)
    .u32(fields.rootGeneration)
    .fixed(fields.rootPublicKey, KEY_BYTES)
    .u64(fields.sequence)
    .fixed(fields.previousDigest, KEY_BYTES)
    .u64(fields.createdAtMs)
    .u32(fields.entries.length);
  for (const entry of fields.entries) {
    writer
      .string(entry.deviceId)
      .fixed(entry.certificateDigest, KEY_BYTES)
      .u8(entry.active ? 1 : 0)
      .u64(entry.addedAtMs)
      .u8(entry.revokedAtMs === undefined ? 0 : 1)
      .u64(entry.revokedAtMs ?? 0);
  }
  return writer.finish();
}

export function decodeDeviceRosterTranscript(bytes: Uint8Array): DeviceRosterTranscript {
  const reader = beginRead(bytes, E2EE_IDENTITY_TRANSCRIPT_TAGS.deviceRoster);
  const actorId = reader.string();
  const rootGeneration = reader.u32();
  const rootPublicKey = reader.fixed(KEY_BYTES);
  const sequence = reader.u64();
  const previousDigest = reader.fixed(KEY_BYTES);
  const createdAtMs = reader.u64();
  const entryCount = reader.u32();
  const entries: DeviceRosterEntryTranscript[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    const deviceId = reader.string();
    const certificateDigest = reader.fixed(KEY_BYTES);
    const active = readBooleanByte(reader, 'Roster entry active');
    const addedAtMs = reader.u64();
    const hasRevokedAt = readBooleanByte(reader, 'Roster entry hasRevokedAt');
    const revokedAtMs = reader.u64();
    if (!hasRevokedAt && revokedAtMs !== 0) {
      throw new MalformedInputError('Roster entry carries a revocation time it does not claim.');
    }
    entries.push({
      deviceId,
      certificateDigest,
      active,
      addedAtMs,
      ...(hasRevokedAt ? { revokedAtMs } : {}),
    });
  }
  reader.end();
  const fields: DeviceRosterTranscript = {
    actorId,
    rootGeneration,
    rootPublicKey,
    sequence,
    previousDigest,
    createdAtMs,
    entries,
  };
  assertDeviceRoster(fields);
  return fields;
}

/**
 * T4 — prekey bundle (tag 4), signed by the *device's* Ed25519 signing key.
 *
 * Deliberately binds no roster digest (ADR 0033 §2): a device signature covering a roster
 * snapshot would force every device to re-sign every prekey on every roster change. Roster
 * membership is enforced by the verifier instead — the bundle's `certificateDigest` must be an
 * active entry of an independently verified roster.
 */
export interface PreKeyBundleTranscript {
  readonly actorId: string;
  readonly deviceId: string;
  /** SHA-256 of the device's T2 bytes. */
  readonly certificateDigest: Uint8Array;
  readonly signedPrekeyId: number;
  readonly signedPrekeyPublicKey: Uint8Array;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

function assertPreKeyBundle(fields: PreKeyBundleTranscript): void {
  requireIdentifier(fields.actorId, 'Prekey bundle actorId');
  requireIdentifier(fields.deviceId, 'Prekey bundle deviceId');
  requireKeyBytes(fields.certificateDigest, 'Prekey bundle certificateDigest');
  requirePositiveCounter(fields.signedPrekeyId, 'Signed prekey id');
  requireKeyBytes(fields.signedPrekeyPublicKey, 'Signed prekey public key');
  requireValidityWindow(fields.createdAtMs, fields.expiresAtMs, 'Prekey bundle');
}

export function encodePreKeyBundleTranscript(fields: PreKeyBundleTranscript): Uint8Array {
  assertPreKeyBundle(fields);
  return beginTranscript(E2EE_IDENTITY_TRANSCRIPT_TAGS.preKeyBundle)
    .string(fields.actorId)
    .string(fields.deviceId)
    .fixed(fields.certificateDigest, KEY_BYTES)
    .u64(fields.signedPrekeyId)
    .fixed(fields.signedPrekeyPublicKey, KEY_BYTES)
    .u64(fields.createdAtMs)
    .u64(fields.expiresAtMs)
    .finish();
}

export function decodePreKeyBundleTranscript(bytes: Uint8Array): PreKeyBundleTranscript {
  const reader = beginRead(bytes, E2EE_IDENTITY_TRANSCRIPT_TAGS.preKeyBundle);
  const actorId = reader.string();
  const deviceId = reader.string();
  const certificateDigest = reader.fixed(KEY_BYTES);
  const signedPrekeyId = reader.u64();
  const signedPrekeyPublicKey = reader.fixed(KEY_BYTES);
  const createdAtMs = reader.u64();
  const expiresAtMs = reader.u64();
  reader.end();
  const fields: PreKeyBundleTranscript = {
    actorId,
    deviceId,
    certificateDigest,
    signedPrekeyId,
    signedPrekeyPublicKey,
    createdAtMs,
    expiresAtMs,
  };
  assertPreKeyBundle(fields);
  return fields;
}
