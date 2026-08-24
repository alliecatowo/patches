/**
 * Client-side readers for the node's canonical identity transcripts (ADR 0020 §2).
 *
 * `certificate_bytes` / `roster_bytes` are the authoritative content every signature
 * covers, and the concrete encoding is owned today by the node's codec
 * (`apps/server/src/modules/e2ee/e2ee.codec.ts`). That module documents the follow-up —
 * hoist the encoder into `@patches/domain` "once a client needs to produce these bytes"
 * — but `packages/**` is read-only in this change, so the *reader* half lives here,
 * field-for-field identical to the server's writer, and a test pins the two layouts
 * together by construction.
 *
 * Why bother: `verifyDeviceCertificate` requires the caller to have confirmed that the
 * node's decoded convenience fields agree with the signed transcript
 * (`decodedMatchesTranscript`), and an honest `true` needs these bytes decoded. Skipping
 * the decode and passing `true` anyway would be exactly the "trusts a server-supplied
 * decoding" move ADR 0020 §14.2 forbids.
 */
import { ByteReader, ByteWriter, KEY_BYTES, sha256Hash } from '@patches/crypto';
import { bytesEqual, type Bytes } from '@patches/domain';

import { toDate } from '../api/wire/time.js';
import type { E2eeDeviceCertificate, E2eeDeviceRoster } from '../api/wire/types.js';

/** Same constant as the server codec's `CERTIFICATE_TRANSCRIPT_DOMAIN`. */
const CERTIFICATE_TRANSCRIPT_DOMAIN = 'patches-e2ee-v1/node-device-cert';
/** Same constant as the server codec's `ROSTER_TRANSCRIPT_DOMAIN`. */
const ROSTER_TRANSCRIPT_DOMAIN = 'patches-e2ee-v1/node-roster-canonical';
/**
 * Same constant as the server codec's `PREKEY_BUNDLE_TRANSCRIPT_DOMAIN` (B-107: the
 * enrollment flow is the first client that must *produce* these bytes, so the writer
 * half of that encoder now lives here too — field-for-field the server's
 * `encodePrekeyBundleTranscript`, including its pinned-empty `protocolVersion`).
 */
const PREKEY_BUNDLE_TRANSCRIPT_DOMAIN = 'patches-e2ee-v1/signed-prekey-bundle';

export interface DecodedCertificateTranscript {
  readonly actorId: string;
  readonly deviceId: string;
  readonly rootGeneration: number;
  readonly certificateVersion: number;
  readonly signingPublicKey: Bytes;
  readonly agreementPublicKey: Bytes;
  readonly supportedProtocolVersions: readonly string[];
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

/**
 * The node's certificate transcript encoder — field-for-field the server codec's
 * `encodeCertificateTranscript`. Kept beside the reader so a test can produce authentic
 * transcripts and pin this client's verification to what the node actually signs.
 */
export function encodeCertificateTranscript(fields: DecodedCertificateTranscript): Bytes {
  const writer = new ByteWriter()
    .string(CERTIFICATE_TRANSCRIPT_DOMAIN)
    .string(fields.actorId)
    .string(fields.deviceId)
    .u32(fields.rootGeneration)
    .u32(fields.certificateVersion)
    .fixed(fields.signingPublicKey, KEY_BYTES)
    .fixed(fields.agreementPublicKey, KEY_BYTES)
    .u32(fields.supportedProtocolVersions.length);
  for (const version of fields.supportedProtocolVersions) writer.string(version);
  return writer.u64(fields.createdAtMs).u64(fields.expiresAtMs).finish();
}

export function decodeCertificateTranscript(bytes: Bytes): DecodedCertificateTranscript {
  const reader = new ByteReader(bytes);
  const domain = reader.string();
  if (domain !== CERTIFICATE_TRANSCRIPT_DOMAIN) {
    throw new Error('Certificate transcript has the wrong domain separator.');
  }
  const actorId = reader.string();
  const deviceId = reader.string();
  const rootGeneration = reader.u32();
  const certificateVersion = reader.u32();
  const signingPublicKey = reader.fixed(32);
  const agreementPublicKey = reader.fixed(32);
  const versionCount = reader.u32();
  const supportedProtocolVersions: string[] = [];
  for (let index = 0; index < versionCount; index += 1) {
    supportedProtocolVersions.push(reader.string());
  }
  const createdAtMs = reader.u64();
  const expiresAtMs = reader.u64();
  reader.end();
  return {
    actorId,
    deviceId,
    rootGeneration,
    certificateVersion,
    signingPublicKey,
    agreementPublicKey,
    supportedProtocolVersions,
    createdAtMs,
    expiresAtMs,
  };
}

export interface DecodedRosterEntryTranscript {
  readonly deviceId: string;
  readonly certificateDigest: Bytes;
  readonly active: boolean;
  readonly addedAtMs: number;
  readonly revokedAtMs?: number | undefined;
}

export interface DecodedRosterTranscript {
  readonly actorId: string;
  readonly sequence: bigint;
  readonly rootGeneration: number;
  readonly previousDigest: Bytes;
  readonly entries: readonly DecodedRosterEntryTranscript[];
}

/** The node's roster transcript encoder — mirrors `encodeRosterTranscript` server-side. */
export function encodeRosterTranscript(fields: DecodedRosterTranscript): Bytes {
  if (fields.sequence < 0n || fields.sequence > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Roster sequence is out of range.');
  }
  const writer = new ByteWriter()
    .string(ROSTER_TRANSCRIPT_DOMAIN)
    .string(fields.actorId)
    .u64(Number(fields.sequence))
    .u32(fields.rootGeneration)
    .fixed(fields.previousDigest, KEY_BYTES)
    .u32(fields.entries.length);
  for (const entry of fields.entries) {
    writer
      .string(entry.deviceId)
      .fixed(entry.certificateDigest, KEY_BYTES)
      .u8(entry.active ? 1 : 0)
      .u64(entry.addedAtMs);
    const revokedAtMs = entry.revokedAtMs;
    if (revokedAtMs === undefined) {
      writer.u8(0).u64(0);
    } else {
      writer.u8(1).u64(revokedAtMs);
    }
  }
  return writer.finish();
}

export function decodeRosterTranscript(bytes: Bytes): DecodedRosterTranscript {
  const reader = new ByteReader(bytes);
  const domain = reader.string();
  if (domain !== ROSTER_TRANSCRIPT_DOMAIN) {
    throw new Error('Roster transcript has the wrong domain separator.');
  }
  const actorId = reader.string();
  const sequence = BigInt(reader.u64());
  const rootGeneration = reader.u32();
  const previousDigest = reader.fixed(32);
  const entryCount = reader.u32();
  const entries: DecodedRosterEntryTranscript[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    const deviceId = reader.string();
    const certificateDigest = reader.fixed(32);
    const active = reader.u8() === 1;
    const addedAtMs = reader.u64();
    // The revoked-at pair is fixed-width on the wire (flag byte + u64), always present.
    const hasRevokedAt = reader.u8() === 1;
    const revokedAtMsValue = reader.u64();
    const revokedAtMs = hasRevokedAt ? revokedAtMsValue : undefined;
    entries.push({
      deviceId,
      certificateDigest,
      active,
      addedAtMs,
      ...(revokedAtMs === undefined ? {} : { revokedAtMs }),
    });
  }
  reader.end();
  return { actorId, sequence, rootGeneration, previousDigest, entries };
}

export interface PrekeyBundleTranscriptFields {
  readonly certificateDigest: Bytes;
  readonly agreementPublicKey: Bytes;
  /**
   * Pinned to the empty string by the node's verifier (`device-roster.service.ts`): a
   * device's advertised protocol versions are not a persisted column, so enroll-time and
   * rotate-time transcripts must agree on this placeholder. The enrollment flow passes
   * `''` and this type keeps the field explicit rather than hiding the agreement.
   */
  readonly protocolVersion: string;
  readonly actorId: string;
  readonly deviceId: string;
  readonly signedPrekeyId: number;
  readonly signedPrekeyPublicKey: Bytes;
  readonly signedPrekeyCreatedAtMs: number;
  readonly signedPrekeyExpiresAtMs: number;
}

/**
 * The node's signed-prekey bundle transcript encoder — field-for-field the server
 * codec's `encodePrekeyBundleTranscript`. Both signatures `EnrollDevice` carries over a
 * new signed prekey (`signed_prekey.signature` and `prekey_bundle_signature`) cover
 * these bytes, verified against this exact layout server-side.
 */
export function encodePrekeyBundleTranscript(fields: PrekeyBundleTranscriptFields): Bytes {
  if (
    !Number.isSafeInteger(fields.signedPrekeyId) ||
    fields.signedPrekeyId < 0 ||
    fields.signedPrekeyId > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('Signed prekey id is out of range.');
  }
  return new ByteWriter()
    .string(PREKEY_BUNDLE_TRANSCRIPT_DOMAIN)
    .fixed(fields.certificateDigest, KEY_BYTES)
    .fixed(fields.agreementPublicKey, KEY_BYTES)
    .string(fields.protocolVersion)
    .string(fields.actorId)
    .string(fields.deviceId)
    .u64(fields.signedPrekeyId)
    .fixed(fields.signedPrekeyPublicKey, KEY_BYTES)
    .u64(fields.signedPrekeyCreatedAtMs)
    .u64(fields.signedPrekeyExpiresAtMs)
    .finish();
}

/**
 * True when every decoded convenience field of the served certificate agrees with what
 * its own signed transcript says. Any disagreement — or any malformed transcript — is a
 * failed match, never an exception leaking into trust decisions.
 */
export function wireCertificateMatchesTranscript(certificate: E2eeDeviceCertificate): boolean {
  if (certificate.certificateBytes.length === 0) return false;
  let decoded: DecodedCertificateTranscript;
  try {
    decoded = decodeCertificateTranscript(certificate.certificateBytes);
  } catch {
    return false;
  }
  if (!bytesEqual(sha256Hash(certificate.certificateBytes), certificate.certificateDigest)) {
    return false;
  }
  if (
    !bytesEqual(decoded.signingPublicKey, certificate.signingPublicKey) ||
    !bytesEqual(decoded.agreementPublicKey, certificate.agreementPublicKey) ||
    decoded.rootGeneration !== certificate.rootGeneration ||
    decoded.certificateVersion !== certificate.certificateVersion ||
    decoded.actorId !== certificate.actorId ||
    decoded.deviceId !== certificate.deviceId ||
    decoded.createdAtMs !== (toDate(certificate.createdAt)?.getTime() ?? -1) ||
    decoded.expiresAtMs !== (toDate(certificate.expiresAt)?.getTime() ?? -1)
  ) {
    return false;
  }
  return (
    decoded.supportedProtocolVersions.join('\u0000') ===
    certificate.supportedProtocolVersions.join('\u0000')
  );
}

/**
 * True when the roster's decoded entry view matches its signed transcript. Same rule as
 * above: the convenience fields the node serves alongside `roster_bytes` are checked
 * against the bytes, never trusted on their own.
 */
export function wireRosterMatchesTranscript(roster: E2eeDeviceRoster): boolean {
  if (roster.rosterBytes.length === 0) return false;
  let decoded: DecodedRosterTranscript;
  try {
    decoded = decodeRosterTranscript(roster.rosterBytes);
  } catch {
    return false;
  }
  if (
    !bytesEqual(sha256Hash(roster.rosterBytes), roster.digest) ||
    decoded.actorId !== roster.actorId ||
    decoded.sequence !== roster.sequence ||
    decoded.rootGeneration !== roster.rootGeneration ||
    !bytesEqual(decoded.previousDigest, roster.previousDigest) ||
    decoded.entries.length !== roster.entries.length
  ) {
    return false;
  }
  return decoded.entries.every((entry, index) => {
    const wireEntry = roster.entries[index];
    if (wireEntry === undefined) return false;
    return (
      entry.deviceId === wireEntry.deviceId &&
      bytesEqual(entry.certificateDigest, wireEntry.certificateDigest) &&
      entry.active === wireEntry.active &&
      entry.addedAtMs === (toDate(wireEntry.addedAt)?.getTime() ?? Number.NaN)
    );
  });
}
