import { ByteReader, ByteWriter } from '@patches/crypto';
import { bytesEqual, type Bytes, type E2eeRosterEntryView } from '@patches/domain';
import { timestampToDate } from '@patches/proto';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Canonical transcripts for `E2eeDeviceCertificate.certificate_bytes`,
 * `E2eeDeviceRoster.roster_bytes`, and the signed-prekey-bundle signature (ADR 0020 §2, §5,
 * §14.14.2). `packages/proto/proto/patches/v1/e2ee.proto` states that `certificate_bytes` and
 * `roster_bytes` are "the exact canonical bytes" a signature covers but deliberately leaves the
 * concrete encoding to the implementation, the same way `@patches/domain`'s
 * `canonicalFanoutTranscript` owns the fanout encoding.
 *
 * This node owns *this* encoding: every client that wants `EnrollDevice`/`PublishDeviceRoster`/
 * `UploadPrekeys` to succeed against this node must produce `certificate_bytes`/`roster_bytes`/
 * `prekey_bundle_bytes` that match it byte-for-byte (checked below via `decodedMatchesTranscript`
 * checks the same way `@patches/domain/certificates.ts` documents). It is *not* yet hoisted into
 * `@patches/domain` for every client to share — that package is owned by a different concurrent
 * task in this change and this module cannot edit it. Follow-up: move this codec into
 * `@patches/domain` once a client (P13-010, TUI) needs to produce these bytes itself, so there is
 * one encoder instead of a second one that has to agree with this file by coincidence.
 *
 * Every persisted entity in `packages/database` stores the *authoritative* bytes
 * (`certificate_bytes`, `roster_bytes`, the prekey-bundle `signature`) but not the decoded
 * convenience fields the wire messages also carry (`certificate_version`,
 * `supported_protocol_versions`, roster `entries`) — those columns don't exist. This codec is
 * therefore also how the node reconstructs them on read: decoding is safe here specifically
 * because the node itself enforced, on write, that encoding these same fields reproduces the
 * stored bytes exactly.
 */

const CERTIFICATE_TRANSCRIPT_DOMAIN = 'patches-e2ee-v1/device-certificate';
const ROSTER_TRANSCRIPT_DOMAIN = 'patches-e2ee-v1/device-roster';
const PREKEY_BUNDLE_TRANSCRIPT_DOMAIN = 'patches-e2ee-v1/signed-prekey-bundle';

function msFromDate(value: Date, label: string): number {
  const ms = value.getTime();
  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw AppError.validation(`${label} is not a valid timestamp.`);
  }
  return ms;
}

/**
 * Every `google.protobuf.Timestamp` field this module reads is required — `timestampToDate`
 * returns `Date | undefined` (absent *or* malformed both decode to `undefined`), so every call
 * site would otherwise carry a `Date | undefined` that `exactOptionalPropertyTypes` then refuses
 * to hand to a non-optional entity column. This is the one place that turns "absent" into a
 * clear client-facing validation error instead of a type-checker workaround.
 */
export function requireTimestamp(
  timestamp: { seconds: string | number; nanos: number } | undefined,
  label: string,
): Date {
  const date = timestamp === undefined ? undefined : timestampToDate(timestamp);
  if (date === undefined) throw AppError.validation(`${label} is required.`);
  return date;
}

/** Fields of `E2eeDeviceCertificate` that `root_signature` covers, decoded-view shape. */
export interface CertificateTranscriptFields {
  readonly actorId: string;
  readonly deviceId: string;
  readonly rootGeneration: number;
  readonly certificateVersion: number;
  readonly signingPublicKey: Bytes;
  readonly agreementPublicKey: Bytes;
  readonly supportedProtocolVersions: readonly string[];
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export function encodeCertificateTranscript(fields: CertificateTranscriptFields): Bytes {
  const writer = new ByteWriter()
    .string(CERTIFICATE_TRANSCRIPT_DOMAIN)
    .string(fields.actorId)
    .string(fields.deviceId)
    .u32(fields.rootGeneration)
    .u32(fields.certificateVersion)
    .fixed(fields.signingPublicKey)
    .fixed(fields.agreementPublicKey)
    .u32(fields.supportedProtocolVersions.length);
  for (const version of fields.supportedProtocolVersions) writer.string(version);
  return writer
    .u64(msFromDate(fields.createdAt, 'Certificate createdAt'))
    .u64(msFromDate(fields.expiresAt, 'Certificate expiresAt'))
    .finish();
}

export function decodeCertificateTranscript(bytes: Bytes): CertificateTranscriptFields {
  try {
    const reader = new ByteReader(bytes);
    const domain = reader.string();
    if (domain !== CERTIFICATE_TRANSCRIPT_DOMAIN) {
      throw AppError.validation('Certificate transcript has the wrong domain separator.');
    }
    const actorId = reader.string();
    const deviceId = reader.string();
    const rootGeneration = reader.u32();
    const certificateVersion = reader.u32();
    const signingPublicKey = reader.fixed(32);
    const agreementPublicKey = reader.fixed(32);
    const versionCount = reader.u32();
    const supportedProtocolVersions: string[] = [];
    for (let i = 0; i < versionCount; i += 1) supportedProtocolVersions.push(reader.string());
    const createdAt = new Date(reader.u64());
    const expiresAt = new Date(reader.u64());
    reader.end();
    return {
      actorId,
      deviceId,
      rootGeneration,
      certificateVersion,
      signingPublicKey,
      agreementPublicKey,
      supportedProtocolVersions,
      createdAt,
      expiresAt,
    };
  } catch (error) {
    throw AppError.validation('Stored device certificate transcript is corrupt.', { cause: error });
  }
}

/** Fields of `E2eeDeviceRoster` that `root_signature` covers, decoded-view shape. */
export interface RosterTranscriptFields {
  readonly actorId: string;
  readonly sequence: bigint;
  readonly rootGeneration: number;
  readonly previousDigest: Bytes;
  readonly entries: readonly E2eeRosterEntryView[];
}

export function encodeRosterTranscript(fields: RosterTranscriptFields): Bytes {
  if (fields.sequence < 0n || fields.sequence > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw AppError.validation('Roster sequence is out of range.');
  }
  const writer = new ByteWriter()
    .string(ROSTER_TRANSCRIPT_DOMAIN)
    .string(fields.actorId)
    .u64(Number(fields.sequence))
    .u32(fields.rootGeneration)
    .fixed(fields.previousDigest)
    .u32(fields.entries.length);
  for (const entry of fields.entries) {
    writer
      .string(entry.deviceId)
      .fixed(entry.certificateDigest)
      .u8(entry.active ? 1 : 0)
      .u64(msFromDate(entry.addedAt, 'Roster entry addedAt'));
    const revokedAt = entry.revokedAt;
    if (revokedAt === null || revokedAt === undefined) {
      writer.u8(0).u64(0);
    } else {
      writer.u8(1).u64(msFromDate(revokedAt, 'Roster entry revokedAt'));
    }
  }
  return writer.finish();
}

export function decodeRosterTranscript(bytes: Bytes): RosterTranscriptFields {
  try {
    const reader = new ByteReader(bytes);
    const domain = reader.string();
    if (domain !== ROSTER_TRANSCRIPT_DOMAIN) {
      throw AppError.validation('Roster transcript has the wrong domain separator.');
    }
    const actorId = reader.string();
    const sequence = BigInt(reader.u64());
    const rootGeneration = reader.u32();
    const previousDigest = reader.fixed(32);
    const entryCount = reader.u32();
    const entries: E2eeRosterEntryView[] = [];
    for (let i = 0; i < entryCount; i += 1) {
      const deviceId = reader.string();
      const certificateDigest = reader.fixed(32);
      const active = reader.u8() === 1;
      const addedAt = new Date(reader.u64());
      const hasRevokedAt = reader.u8() === 1;
      const revokedAtMs = reader.u64();
      entries.push({
        deviceId,
        certificateDigest,
        active,
        addedAt,
        revokedAt: hasRevokedAt ? new Date(revokedAtMs) : undefined,
      });
    }
    reader.end();
    return { actorId, sequence, rootGeneration, previousDigest, entries };
  } catch (error) {
    throw AppError.validation('Stored device roster transcript is corrupt.', { cause: error });
  }
}

/**
 * Fields of the signed-prekey bundle transcript, matching `E2eeSignedPrekey`'s doc comment:
 * "certificate digest, agreement key, ids, protocol/KDF versions, creation, and expiry" — not
 * the one-time prekeys, which are unsigned and rotate independently of this transcript.
 */
export interface PrekeyBundleTranscriptFields {
  readonly certificateDigest: Bytes;
  readonly agreementPublicKey: Bytes;
  readonly protocolVersion: string;
  readonly actorId: string;
  readonly deviceId: string;
  readonly signedPrekeyId: bigint;
  readonly signedPrekeyPublicKey: Bytes;
  readonly signedPrekeyCreatedAt: Date;
  readonly signedPrekeyExpiresAt: Date;
}

export function encodePrekeyBundleTranscript(fields: PrekeyBundleTranscriptFields): Bytes {
  if (fields.signedPrekeyId < 0n || fields.signedPrekeyId > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw AppError.validation('Signed prekey id is out of range.');
  }
  return new ByteWriter()
    .string(PREKEY_BUNDLE_TRANSCRIPT_DOMAIN)
    .fixed(fields.certificateDigest)
    .fixed(fields.agreementPublicKey)
    .string(fields.protocolVersion)
    .string(fields.actorId)
    .string(fields.deviceId)
    .u64(Number(fields.signedPrekeyId))
    .fixed(fields.signedPrekeyPublicKey)
    .u64(msFromDate(fields.signedPrekeyCreatedAt, 'Signed prekey createdAt'))
    .u64(msFromDate(fields.signedPrekeyExpiresAt, 'Signed prekey expiresAt'))
    .finish();
}

/** Throws `AppError('E2EE_CERTIFICATE_INVALID', ...)` unless `left` and `right` are equal. */
export function assertBytesEqual(left: Bytes, right: Bytes, message: string): void {
  if (!bytesEqual(left, right)) {
    throw new AppError('E2EE_CERTIFICATE_INVALID', message);
  }
}

export function toBytes(value: Buffer | Uint8Array): Bytes {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
