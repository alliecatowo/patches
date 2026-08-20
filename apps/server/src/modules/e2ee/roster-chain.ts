import {
  E2eeDeviceRoster as E2eeDeviceRosterEntity,
  E2eeIdentityRoot as E2eeIdentityRootEntity,
} from '@patches/database';
import {
  assertRosterSucceeds,
  bytesEqual,
  E2eeContractError,
  rosterGenesisPreviousDigest,
  verifyRosterSignature,
  type E2eeDeviceRosterView,
  type E2eeIdentityRootView,
  type E2eeRosterEntryView,
} from '@patches/domain';
import { timestampToDate, type E2eeDeviceRoster as E2eeDeviceRosterProto } from '@patches/proto';
import { IsNull, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { e2eeDigest, e2eeSignatureVerifier } from './e2ee-crypto.adapter.js';
import {
  assertBytesEqual,
  decodeRosterTranscript,
  encodeRosterTranscript,
  requireTimestamp,
  toBytes,
} from './e2ee.codec.js';

/** Loads the actor's current (non-rotated) messaging identity root, or throws. */
export async function loadActiveRoot(
  manager: EntityManager,
  actorId: string,
): Promise<E2eeIdentityRootEntity> {
  const root = await manager.getRepository(E2eeIdentityRootEntity).findOne({
    where: { actorId, rotatedAt: IsNull() },
  });
  if (root === null) {
    throw new AppError(
      'E2EE_IDENTITY_ROOT_NOT_FOUND',
      'This actor has not published a messaging identity root.',
    );
  }
  return root;
}

export function toIdentityRootView(root: E2eeIdentityRootEntity): E2eeIdentityRootView {
  return {
    actorId: root.actorId,
    generation: root.generation,
    publicKey: toBytes(root.publicKey),
    // The row only stores the public key, not the self-signed transcript: identity-root
    // signature verification happens once, at `PublishIdentityRoot` time, against the request's
    // own `rootBytes`/`selfSignature`. A stored root is never re-verified against itself here —
    // `rootBytes`/`selfSignature` are not persisted because nothing downstream needs them again.
    rootBytes: new Uint8Array(0),
    selfSignature: new Uint8Array(0),
  };
}

/** Loads the actor's newest roster row, or `null` if none has been published yet. */
export async function loadCurrentRosterRow(
  manager: EntityManager,
  actorId: string,
): Promise<E2eeDeviceRosterEntity | null> {
  return manager.getRepository(E2eeDeviceRosterEntity).findOne({
    where: { actorId },
    order: { sequence: 'DESC' },
  });
}

function toRosterEntryView(entry: E2eeDeviceRosterProto['entries'][number]): E2eeRosterEntryView {
  return {
    deviceId: entry.deviceId,
    certificateDigest: toBytes(entry.certificateDigest),
    active: entry.active,
    addedAt: requireTimestamp(entry.addedAt, 'Roster entry addedAt'),
    revokedAt: entry.revokedAt === undefined ? undefined : timestampToDate(entry.revokedAt),
  };
}

/**
 * Decodes a stored roster row's `entries` and `rootGeneration` from its authoritative
 * `rosterBytes` — neither is a persisted column (see this file's top-of-file comment on
 * `appendRoster`).
 */
export function decodeStoredRoster(row: E2eeDeviceRosterEntity): {
  readonly entries: readonly E2eeRosterEntryView[];
  readonly rootGeneration: number;
} {
  const decoded = decodeRosterTranscript(toBytes(row.rosterBytes));
  return { entries: decoded.entries, rootGeneration: decoded.rootGeneration };
}

function rowToView(row: E2eeDeviceRosterEntity): E2eeDeviceRosterView {
  const decoded = decodeStoredRoster(row);
  return {
    actorId: row.actorId,
    sequence: BigInt(row.sequence),
    rootGeneration: decoded.rootGeneration,
    previousDigest: toBytes(row.previousDigest),
    digest: toBytes(row.digest),
    rosterBytes: toBytes(row.rosterBytes),
    rootSignature: toBytes(row.rootSignature),
    entries: decoded.entries,
    createdAt: row.createdAt,
  };
}

function wrapContractError(
  error: unknown,
  code: 'E2EE_CERTIFICATE_INVALID' | 'E2EE_ROSTER_CONFLICT',
): never {
  if (error instanceof E2eeContractError) throw new AppError(code, error.message);
  throw error;
}

/**
 * Verifies and appends one roster to `actorId`'s append-only log, inside the caller's
 * transaction (`manager`). Shared by `EnrollDevice`, `RevokeDevice`, `PublishDeviceRoster`, and
 * `PublishIdentityRoot`'s rotation path — every one of them is "verify this signed roster chains
 * onto the current one, then persist it" (ADR 0020 §2, §14.14.4).
 */
export async function appendRoster(
  manager: EntityManager,
  actorId: string,
  rosterProto: E2eeDeviceRosterProto,
  root: E2eeIdentityRootView,
): Promise<{ row: E2eeDeviceRosterEntity; entries: readonly E2eeRosterEntryView[] }> {
  if (rosterProto.actorId !== actorId) {
    throw AppError.validation('Cannot publish a device roster for another actor.');
  }
  const entries = rosterProto.entries.map(toRosterEntryView);
  const sequence = BigInt(rosterProto.sequence);
  const nextView: E2eeDeviceRosterView = {
    actorId,
    sequence,
    rootGeneration: rosterProto.rootGeneration,
    previousDigest: toBytes(rosterProto.previousDigest),
    digest: toBytes(rosterProto.digest),
    rosterBytes: toBytes(rosterProto.rosterBytes),
    rootSignature: toBytes(rosterProto.rootSignature),
    entries,
    createdAt: new Date(),
  };

  // `entries`/`sequence`/`previousDigest` are a decoded convenience view alongside the
  // authoritative `rosterBytes` (proto doc comment on `E2eeDeviceRoster`) — nothing in
  // `@patches/domain` checks that the two agree, so this node does, the same way
  // `verifyDeviceCertificate`'s `decodedMatchesTranscript` does for certificates.
  assertBytesEqual(
    encodeRosterTranscript({
      actorId,
      sequence,
      rootGeneration: nextView.rootGeneration,
      previousDigest: nextView.previousDigest,
      entries,
    }),
    nextView.rosterBytes,
    'Roster entries do not match the signed roster transcript.',
  );

  try {
    verifyRosterSignature(nextView, root, { verifier: e2eeSignatureVerifier, digest: e2eeDigest });
  } catch (error) {
    wrapContractError(error, 'E2EE_CERTIFICATE_INVALID');
  }

  const previousRow = await loadCurrentRosterRow(manager, actorId);
  const previousView = previousRow === null ? null : rowToView(previousRow);

  try {
    assertRosterSucceeds(previousView, nextView);
  } catch (error) {
    wrapContractError(error, 'E2EE_ROSTER_CONFLICT');
  }

  if (previousRow === null && !bytesEqual(nextView.previousDigest, rosterGenesisPreviousDigest())) {
    throw new AppError(
      'E2EE_ROSTER_CONFLICT',
      'The first roster must chain from the genesis digest.',
    );
  }

  const row = manager.getRepository(E2eeDeviceRosterEntity).create({
    actorId,
    sequence: sequence.toString(),
    previousDigest: Buffer.from(nextView.previousDigest),
    digest: Buffer.from(nextView.digest),
    rosterBytes: Buffer.from(nextView.rosterBytes),
    rootSignature: Buffer.from(nextView.rootSignature),
  });
  const saved = await manager.getRepository(E2eeDeviceRosterEntity).save(row);
  return { row: saved, entries };
}
