import {
  decodeDeviceCertificateTranscript,
  decodeDeviceRosterTranscript,
  decodePreKeyBundleTranscript,
  encodeDeviceCertificateTranscript,
  encodeDeviceRosterTranscript,
  encodePreKeyBundleTranscript,
  type DeviceRosterEntryTranscript,
} from '@patches/crypto';
import { bytesEqual, type Bytes, type E2eeRosterEntryView } from '@patches/domain';
import { timestampToDate } from '@patches/proto';

import { AppError } from '../../common/errors/app-error.js';

/**
 * This node's proto/`Date` adaptation over ADR 0033's single canonical identity transcript
 * family, which now lives entirely in `@patches/crypto` (`identity-transcript.ts`). This module
 * owns no encoding of its own: it converts between the wire's `google.protobuf.Timestamp` /
 * `Date` fields and `@patches/crypto`'s millisecond-number fields, and between `@patches/domain`'s
 * `E2eeRosterEntryView` shape and `@patches/crypto`'s `DeviceRosterEntryTranscript` shape, then
 * delegates every encode/decode to the shared codec. A malformed stored transcript is reported as
 * an `AppError` here rather than the raw `MalformedInputError` `@patches/crypto` throws, so the
 * gRPC error mapper sees a code it knows what to do with.
 */

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
  /** The exact root key that must have signed this certificate (ADR 0033 §2). */
  readonly rootPublicKey: Bytes;
  readonly certificateVersion: number;
  readonly signingPublicKey: Bytes;
  readonly agreementPublicKey: Bytes;
  readonly supportedProtocolVersions: readonly string[];
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export function encodeCertificateTranscript(fields: CertificateTranscriptFields): Bytes {
  return encodeDeviceCertificateTranscript({
    actorId: fields.actorId,
    deviceId: fields.deviceId,
    rootGeneration: fields.rootGeneration,
    rootPublicKey: fields.rootPublicKey,
    certificateVersion: fields.certificateVersion,
    signingPublicKey: fields.signingPublicKey,
    agreementPublicKey: fields.agreementPublicKey,
    supportedProtocolVersions: fields.supportedProtocolVersions,
    createdAtMs: msFromDate(fields.createdAt, 'Certificate createdAt'),
    expiresAtMs: msFromDate(fields.expiresAt, 'Certificate expiresAt'),
  });
}

export function decodeCertificateTranscript(bytes: Bytes): CertificateTranscriptFields {
  try {
    const decoded = decodeDeviceCertificateTranscript(bytes);
    return {
      actorId: decoded.actorId,
      deviceId: decoded.deviceId,
      rootGeneration: decoded.rootGeneration,
      rootPublicKey: decoded.rootPublicKey,
      certificateVersion: decoded.certificateVersion,
      signingPublicKey: decoded.signingPublicKey,
      agreementPublicKey: decoded.agreementPublicKey,
      supportedProtocolVersions: decoded.supportedProtocolVersions,
      createdAt: new Date(decoded.createdAtMs),
      expiresAt: new Date(decoded.expiresAtMs),
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
  /** The exact root key that must have signed this roster (ADR 0033 §2). */
  readonly rootPublicKey: Bytes;
  readonly previousDigest: Bytes;
  readonly createdAt: Date;
  readonly entries: readonly E2eeRosterEntryView[];
}

function toDeviceRosterEntryTranscript(entry: E2eeRosterEntryView): DeviceRosterEntryTranscript {
  const revokedAt = entry.revokedAt;
  return {
    deviceId: entry.deviceId,
    certificateDigest: entry.certificateDigest,
    active: entry.active,
    addedAtMs: msFromDate(entry.addedAt, 'Roster entry addedAt'),
    ...(revokedAt === null || revokedAt === undefined
      ? {}
      : { revokedAtMs: msFromDate(revokedAt, 'Roster entry revokedAt') }),
  };
}

function fromDeviceRosterEntryTranscript(entry: DeviceRosterEntryTranscript): E2eeRosterEntryView {
  return {
    deviceId: entry.deviceId,
    certificateDigest: entry.certificateDigest,
    active: entry.active,
    addedAt: new Date(entry.addedAtMs),
    revokedAt: entry.revokedAtMs === undefined ? undefined : new Date(entry.revokedAtMs),
  };
}

export function encodeRosterTranscript(fields: RosterTranscriptFields): Bytes {
  if (fields.sequence < 0n || fields.sequence > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw AppError.validation('Roster sequence is out of range.');
  }
  return encodeDeviceRosterTranscript({
    actorId: fields.actorId,
    rootGeneration: fields.rootGeneration,
    rootPublicKey: fields.rootPublicKey,
    sequence: Number(fields.sequence),
    previousDigest: fields.previousDigest,
    createdAtMs: msFromDate(fields.createdAt, 'Roster createdAt'),
    entries: fields.entries.map(toDeviceRosterEntryTranscript),
  });
}

export function decodeRosterTranscript(bytes: Bytes): RosterTranscriptFields {
  try {
    const decoded = decodeDeviceRosterTranscript(bytes);
    return {
      actorId: decoded.actorId,
      sequence: BigInt(decoded.sequence),
      rootGeneration: decoded.rootGeneration,
      rootPublicKey: decoded.rootPublicKey,
      previousDigest: decoded.previousDigest,
      createdAt: new Date(decoded.createdAtMs),
      entries: decoded.entries.map(fromDeviceRosterEntryTranscript),
    };
  } catch (error) {
    throw AppError.validation('Stored device roster transcript is corrupt.', { cause: error });
  }
}

/**
 * Fields of the signed-prekey bundle transcript (ADR 0033 §2, T4). No longer binds
 * `agreementPublicKey` or `protocolVersion` — both were already committed to by
 * `certificateDigest`, and `protocolVersion` was a documented kludge pinned to `''` because a
 * device's advertised versions were never a persisted column. No roster digest either: a device
 * signature covering a roster snapshot would force every device to re-sign every prekey on every
 * roster change of its own account, so roster membership is enforced by the verifier instead.
 */
export interface PrekeyBundleTranscriptFields {
  readonly certificateDigest: Bytes;
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
  return encodePreKeyBundleTranscript({
    actorId: fields.actorId,
    deviceId: fields.deviceId,
    certificateDigest: fields.certificateDigest,
    signedPrekeyId: Number(fields.signedPrekeyId),
    signedPrekeyPublicKey: fields.signedPrekeyPublicKey,
    createdAtMs: msFromDate(fields.signedPrekeyCreatedAt, 'Signed prekey createdAt'),
    expiresAtMs: msFromDate(fields.signedPrekeyExpiresAt, 'Signed prekey expiresAt'),
  });
}

export function decodePrekeyBundleTranscript(bytes: Bytes): PrekeyBundleTranscriptFields {
  try {
    const decoded = decodePreKeyBundleTranscript(bytes);
    return {
      certificateDigest: decoded.certificateDigest,
      actorId: decoded.actorId,
      deviceId: decoded.deviceId,
      signedPrekeyId: BigInt(decoded.signedPrekeyId),
      signedPrekeyPublicKey: decoded.signedPrekeyPublicKey,
      signedPrekeyCreatedAt: new Date(decoded.createdAtMs),
      signedPrekeyExpiresAt: new Date(decoded.expiresAtMs),
    };
  } catch (error) {
    throw AppError.validation('Stored prekey bundle transcript is corrupt.', { cause: error });
  }
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
