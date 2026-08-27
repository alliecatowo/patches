/**
 * The device-link offer transcript and SAS derivation (ADR 0037 §1, §3.2). One more member of
 * the ADR 0033 canonical transcript family: `offerBytes` is the only authoritative content, and
 * a verifier checks the signature over exactly those bytes before trusting anything decoded from
 * them, exactly as `identity-transcript.ts`/`identity.ts` do for the root/certificate/roster/
 * prekey family.
 *
 * A device-link offer is signed by the *new device's own* signing key — never by a messaging
 * root, which the new device by definition does not hold. That signature proves possession of
 * the offered private key only; it is never a substitute for root certification, which only
 * `EnrollDevice` grants once the authority device has confirmed the SAS out of band.
 */
import { ByteReader, ByteWriter, compareUtf8Bytes } from './codec.js';
import { AuthenticationError, MalformedInputError } from './errors.js';
import { sha256Hash, sign, verifyStrict } from './primitives.js';
import { KEY_BYTES, SIGNATURE_BYTES } from './types.js';

/** Domain separator for the device-link offer transcript (ADR 0037 §1). */
export const DEVICE_LINK_OFFER_DOMAIN = 'patches-e2ee-v1/device-link-offer';
export const DEVICE_LINK_OFFER_VERSION = 1;

/** Domain separator for the short authentication string derived from an offer (ADR 0037 §1). */
export const DEVICE_LINK_SAS_DOMAIN = 'patches-e2ee-v1/device-link-sas';

/** How far into the future `createdAtMs` may claim to be before an offer is rejected outright. */
const DEVICE_LINK_OFFER_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const MAX_IDENTIFIER_BYTES = 256;
const identifierEncoder = new TextEncoder();

function requireIdentifier(value: string, label: string): void {
  // Bounded by UTF-8 bytes, not UTF-16 code units, matching `identity-transcript.ts`'s
  // `requireIdentifier` — an identifier's worst-case encoded size must be known up front.
  const bytes = identifierEncoder.encode(value);
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

/** The canonical fields of a device-link offer transcript. */
export interface DeviceLinkOfferFields {
  readonly actorId: string;
  readonly deviceId: string;
  /** Ed25519 public key, 32 bytes — the new device's signing key. */
  readonly signingPublicKey: Uint8Array;
  /** X25519 public key, 32 bytes — the new device's agreement key. */
  readonly agreementPublicKey: Uint8Array;
  /** Strictly ascending by UTF-8 bytes; see {@link sortByUtf8Bytes} in `identity-transcript.ts`. */
  readonly supportedProtocolVersions: readonly string[];
  readonly createdAtMs: number;
  /** Always `createdAtMs` + 10 minutes (ADR 0037 §1); the node mints this on `BeginDeviceLink`. */
  readonly expiresAtMs: number;
}

function assertOfferFields(fields: DeviceLinkOfferFields): void {
  requireIdentifier(fields.actorId, 'Device link offer actorId');
  requireIdentifier(fields.deviceId, 'Device link offer deviceId');
  requireKeyBytes(fields.signingPublicKey, 'Device link offer signingPublicKey');
  requireKeyBytes(fields.agreementPublicKey, 'Device link offer agreementPublicKey');
  requireStrictlyAscending(
    fields.supportedProtocolVersions,
    'Device link offer supported protocol versions',
  );
  requireTimestampMs(fields.createdAtMs, 'Device link offer createdAtMs');
  requireTimestampMs(fields.expiresAtMs, 'Device link offer expiresAtMs');
  if (fields.expiresAtMs <= fields.createdAtMs) {
    throw new MalformedInputError('Device link offer validity window is not strictly positive.');
  }
}

function beginOffer(): ByteWriter {
  return new ByteWriter().string(DEVICE_LINK_OFFER_DOMAIN).u8(DEVICE_LINK_OFFER_VERSION);
}

export function encodeDeviceLinkOffer(fields: DeviceLinkOfferFields): Uint8Array {
  assertOfferFields(fields);
  const writer = beginOffer()
    .string(fields.actorId)
    .string(fields.deviceId)
    .fixed(fields.signingPublicKey, KEY_BYTES)
    .fixed(fields.agreementPublicKey, KEY_BYTES)
    .u32(fields.supportedProtocolVersions.length);
  for (const version of fields.supportedProtocolVersions) writer.string(version);
  return writer.u64(fields.createdAtMs).u64(fields.expiresAtMs).finish();
}

export function decodeDeviceLinkOffer(bytes: Uint8Array): DeviceLinkOfferFields {
  const reader = new ByteReader(bytes);
  if (reader.string() !== DEVICE_LINK_OFFER_DOMAIN) {
    throw new MalformedInputError('Device link offer has the wrong domain separator.');
  }
  if (reader.u8() !== DEVICE_LINK_OFFER_VERSION) {
    throw new MalformedInputError('Device link offer has an unsupported version.');
  }
  const actorId = reader.string();
  const deviceId = reader.string();
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
  const fields: DeviceLinkOfferFields = {
    actorId,
    deviceId,
    signingPublicKey,
    agreementPublicKey,
    supportedProtocolVersions,
    createdAtMs,
    expiresAtMs,
  };
  assertOfferFields(fields);
  return fields;
}

export interface SignedDeviceLinkOffer {
  readonly offerBytes: Uint8Array;
  readonly deviceSignature: Uint8Array;
}

/** Signs a device-link offer with the *new device's* own signing key (never a messaging root). */
export function signDeviceLinkOffer(
  devicePrivateKey: Uint8Array,
  fields: DeviceLinkOfferFields,
): SignedDeviceLinkOffer {
  const offerBytes = encodeDeviceLinkOffer(fields);
  return { offerBytes, deviceSignature: sign(devicePrivateKey, offerBytes) };
}

/**
 * Phantom brand. A `VerifiedDeviceLinkOffer` is an ordinary object at runtime; only
 * {@link verifyDeviceLinkOffer} can produce a *typed* reference to one, so "trust an offer this
 * module did not itself verify" is a compile error rather than a convention (mirrors
 * `identity.ts`'s `VERIFIED_IDENTITY_BRAND`).
 */
declare const VERIFIED_DEVICE_LINK_OFFER_BRAND: unique symbol;

export interface VerifiedDeviceLinkOffer extends DeviceLinkOfferFields {
  readonly [VERIFIED_DEVICE_LINK_OFFER_BRAND]: 'device-link-offer';
  readonly offerBytes: Uint8Array;
  readonly deviceSignature: Uint8Array;
}

function brandVerifiedOffer(
  value: Omit<VerifiedDeviceLinkOffer, typeof VERIFIED_DEVICE_LINK_OFFER_BRAND>,
): VerifiedDeviceLinkOffer {
  return value as VerifiedDeviceLinkOffer;
}

export interface VerifyDeviceLinkOfferInput {
  readonly offerBytes: Uint8Array;
  readonly deviceSignature: Uint8Array;
  readonly nowMs: number;
}

/**
 * Decodes and re-verifies a device-link offer against exactly the bytes supplied — never a
 * node-decoded convenience view (ADR 0037 §1, §3.3). Rejects a wrong-domain/version transcript,
 * trailing bytes, a bad signature, an expired offer, and an offer whose `createdAtMs` claims to
 * be more than {@link DEVICE_LINK_OFFER_MAX_CLOCK_SKEW_MS} in the future.
 */
export function verifyDeviceLinkOffer(input: VerifyDeviceLinkOfferInput): VerifiedDeviceLinkOffer {
  const fields = decodeDeviceLinkOffer(input.offerBytes);
  if (input.deviceSignature.length !== SIGNATURE_BYTES) {
    throw new MalformedInputError('Device link offer signature has an invalid length.');
  }
  if (!verifyStrict(fields.signingPublicKey, input.offerBytes, input.deviceSignature)) {
    throw new AuthenticationError();
  }
  if (input.nowMs >= fields.expiresAtMs) {
    throw new MalformedInputError('Device link offer has expired.');
  }
  if (fields.createdAtMs > input.nowMs + DEVICE_LINK_OFFER_MAX_CLOCK_SKEW_MS) {
    throw new MalformedInputError('Device link offer was created too far in the future.');
  }
  return brandVerifiedOffer({
    ...fields,
    offerBytes: input.offerBytes,
    deviceSignature: input.deviceSignature,
  });
}

const SAS_GROUP_COUNT = 5;
const SAS_GROUP_BITS = 12;
const SAS_TOTAL_BITS = SAS_GROUP_COUNT * SAS_GROUP_BITS;

/**
 * The five-group, four-digit short authentication string a peer compares out of band (ADR 0037
 * §1): the first 60 bits of the domain's digest over `DEVICE_LINK_SAS_DOMAIN · offerBytes ·
 * actorId`, split into five 12-bit groups and rendered as zero-padded decimal (`0000`–`4095`
 * each). Computed from the *bytes received*, never from a node-decoded view — the authority
 * device calls this on the offer bytes it fetched from `ListPendingDeviceLinks`, and the new
 * device calls it on the bytes it is about to sign, so both sides derive it from one shared
 * transcript with no second encoding to disagree about.
 */
export function deviceLinkSas(offerBytes: Uint8Array, actorId: string): string {
  requireIdentifier(actorId, 'Device link SAS actorId');
  const digest = sha256Hash(
    new ByteWriter().string(DEVICE_LINK_SAS_DOMAIN).bytes(offerBytes).string(actorId).finish(),
  );
  // The digest's leading 8 bytes (64 bits) are read big-endian into a bigint, then the top
  // `SAS_TOTAL_BITS` (60) of that are kept — the low 4 bits are discarded so the group boundaries
  // land on whole nibbles, which keeps the bit-to-group mapping simple to audit by hand.
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value = (value << 8n) | BigInt(digest[index] ?? 0);
  }
  const top = value >> BigInt(64 - SAS_TOTAL_BITS);
  const groups: string[] = [];
  for (let group = SAS_GROUP_COUNT - 1; group >= 0; group -= 1) {
    const shift = BigInt(group * SAS_GROUP_BITS);
    const chunk = Number((top >> shift) & 0xfffn);
    groups.push(chunk.toString(10).padStart(4, '0'));
  }
  return groups.join('-');
}
