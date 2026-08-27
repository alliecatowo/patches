import type {
  E2eeDeviceIdentity as E2eeDeviceIdentityEntity,
  E2eeDeviceRoster as E2eeDeviceRosterEntity,
  E2eeIdentityRoot as E2eeIdentityRootEntity,
  E2eeOneTimePrekey as E2eeOneTimePrekeyEntity,
  E2eeSignedPrekey as E2eeSignedPrekeyEntity,
} from '@patches/database';
import { sha256Hash } from '@patches/crypto';
import type { E2eeRosterEntryView } from '@patches/domain';
import {
  dateToTimestamp,
  type E2eeDeviceCertificate as E2eeDeviceCertificateProto,
  type E2eeDeviceRoster as E2eeDeviceRosterProto,
  type E2eeIdentityRoot as E2eeIdentityRootProto,
  type E2eeOneTimePrekey as E2eeOneTimePrekeyProto,
  type E2eeRosterEntry as E2eeRosterEntryProto,
  type E2eeSignedPrekey as E2eeSignedPrekeyProto,
} from '@patches/proto';
// Value (not type-only) import, deliberately: `E2eeDeviceStatus` is a real enum whose runtime
// member is what a gRPC response field needs, not just its TS type. `@patches/proto/nest`
// re-exports the value; only a browser/TUI bundle needs to avoid pulling in
// `@nestjs/microservices` this way (`docs/agents/LEARNINGS.md`'s "proto value-export Nest leak"
// entry) — this file only ever runs inside `apps/server`.
import { E2eeDeviceStatus } from '@patches/proto/nest';

import { decodeCertificateTranscript } from './e2ee.codec.js';

export function toProtoIdentityRoot(root: E2eeIdentityRootEntity): E2eeIdentityRootProto {
  return {
    actorId: root.actorId,
    generation: root.generation,
    publicKey: root.publicKey,
    // A peer client, not this node, is the verifier here (`GetIdentityRoot` is peer-facing) — it
    // has no other way to check the root's self-signature, so the stored transcript bytes must
    // round-trip exactly. `?? Buffer.alloc(0)` only fires for rows published before these columns
    // existed; ADR 0033 §5 wipes them in a separate, independently-sequenced migration (#251).
    rootBytes: root.rootBytes ?? Buffer.alloc(0),
    selfSignature: root.selfSignature ?? Buffer.alloc(0),
    previousRootSignature: root.previousRootSignature ?? Buffer.alloc(0),
    createdAt: dateToTimestamp(root.createdAt),
    rotatedAt: root.rotatedAt === null ? undefined : dateToTimestamp(root.rotatedAt),
  };
}

/** Deriving a device's lifecycle state the way `E2eeDeviceStatus` documents it should be: the
 * node reports what a signed roster and the certificate's own expiry say, never a decision it
 * made itself. */
export function deviceStatus(revokedAt: Date | null, expiresAt: Date, now: Date): E2eeDeviceStatus {
  if (revokedAt !== null) return E2eeDeviceStatus.E2EE_DEVICE_STATUS_REVOKED;
  if (expiresAt.getTime() <= now.getTime()) return E2eeDeviceStatus.E2EE_DEVICE_STATUS_EXPIRED;
  return E2eeDeviceStatus.E2EE_DEVICE_STATUS_ACTIVE;
}

export function toProtoCertificate(
  device: E2eeDeviceIdentityEntity,
  now: Date,
): E2eeDeviceCertificateProto {
  const decoded = decodeCertificateTranscript(new Uint8Array(device.certificateBytes));
  return {
    actorId: device.actorId,
    deviceId: device.deviceId,
    rootGeneration: device.generation,
    certificateVersion: decoded.certificateVersion,
    signingPublicKey: device.signingPublicKey,
    agreementPublicKey: device.agreementPublicKey,
    supportedProtocolVersions: [...decoded.supportedProtocolVersions],
    createdAt: dateToTimestamp(device.certificateCreatedAt),
    expiresAt: dateToTimestamp(device.expiresAt),
    certificateBytes: device.certificateBytes,
    rootSignature: device.rootSignature,
    // Not a persisted column: deterministic from `certificateBytes`, so it's cheaper and
    // impossible-to-drift to recompute on every read than to keep a redundant copy in sync.
    certificateDigest: Buffer.from(sha256Hash(new Uint8Array(device.certificateBytes))),
    status: deviceStatus(device.revokedAt, device.expiresAt, now),
    revokedAt: device.revokedAt === null ? undefined : dateToTimestamp(device.revokedAt),
  };
}

function toProtoRosterEntry(entry: E2eeRosterEntryView): E2eeRosterEntryProto {
  return {
    deviceId: entry.deviceId,
    certificateDigest: Buffer.from(entry.certificateDigest),
    active: entry.active,
    addedAt: dateToTimestamp(entry.addedAt),
    revokedAt:
      entry.revokedAt === null || entry.revokedAt === undefined
        ? undefined
        : dateToTimestamp(entry.revokedAt),
  };
}

export function toProtoRoster(
  row: E2eeDeviceRosterEntity,
  entries: readonly E2eeRosterEntryView[],
  rootGeneration: number,
): E2eeDeviceRosterProto {
  return {
    actorId: row.actorId,
    sequence: row.sequence,
    rootGeneration,
    previousDigest: row.previousDigest,
    digest: row.digest,
    rosterBytes: row.rosterBytes,
    rootSignature: row.rootSignature,
    entries: entries.map(toProtoRosterEntry),
    createdAt: dateToTimestamp(row.createdAt),
  };
}

export function toProtoSignedPrekey(prekey: E2eeSignedPrekeyEntity): E2eeSignedPrekeyProto {
  return {
    keyId: prekey.keyId,
    publicKey: prekey.publicKey,
    signature: prekey.signature,
    createdAt: dateToTimestamp(prekey.createdAt),
    expiresAt: dateToTimestamp(prekey.expiresAt),
  };
}

export function toProtoOneTimePrekey(prekey: E2eeOneTimePrekeyEntity): E2eeOneTimePrekeyProto {
  return { keyId: prekey.keyId, publicKey: prekey.publicKey };
}
