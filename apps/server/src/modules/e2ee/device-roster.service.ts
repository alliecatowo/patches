import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  E2eeDeviceIdentity as E2eeDeviceIdentityEntity,
  E2eeDeviceRoster as E2eeDeviceRosterEntity,
  E2eeOneTimePrekey as E2eeOneTimePrekeyEntity,
  E2eeOneTimePrekeyKeyId as E2eeOneTimePrekeyKeyIdEntity,
  E2eeSignedPrekey as E2eeSignedPrekeyEntity,
} from '@patches/database';
import {
  E2EE_ONE_TIME_PREKEY_TARGET,
  E2eeContractError,
  verifyDeviceCertificate,
  type E2eeDeviceCertificateView,
} from '@patches/domain';
import {
  type EnrollDeviceRequest,
  type EnrollDeviceResponse,
  type GetDeviceRosterRequest,
  type GetDeviceRosterResponse,
  type ListDeviceRostersRequest,
  type ListDeviceRostersResponse,
  type PublishDeviceRosterRequest,
  type PublishDeviceRosterResponse,
  type RevokeDeviceRequest,
  type RevokeDeviceResponse,
} from '@patches/proto';
import { DataSource, IsNull, MoreThan, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { e2eeDigest, e2eeSignatureVerifier } from './e2ee-crypto.adapter.js';
import { E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import {
  assertBytesEqual,
  encodeCertificateTranscript,
  encodePrekeyBundleTranscript,
  requireTimestamp,
  toBytes,
} from './e2ee.codec.js';
import { toProtoCertificate, toProtoRoster } from './e2ee.mapper.js';
import {
  appendRoster,
  decodeStoredRoster,
  loadActiveRoot,
  loadCurrentRosterRow,
  toIdentityRootView,
} from './roster-chain.js';

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const DEVICE_ID_PATTERN = /^[0-9a-f-]{8,64}$/i;

/**
 * `E2eeService`'s device lifecycle: `EnrollDevice`, `RevokeDevice`, `PublishDeviceRoster`,
 * `GetDeviceRoster`, `ListDeviceRosters` (ADR 0020 §2, §10, §12.2, P13-004). Every roster write
 * goes through `appendRoster` (`roster-chain.ts`), which is the one place the monotonic,
 * root-signed chain is enforced.
 */
@Injectable()
export class E2eeDeviceRosterService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rateLimits: E2eeRateLimitService,
  ) {}

  async enrollDevice(
    actorId: string,
    request: EnrollDeviceRequest,
    peer: string | undefined = undefined,
  ): Promise<EnrollDeviceResponse> {
    const certProto = request.certificate;
    const rosterProto = request.roster;
    const signedPrekeyProto = request.signedPrekey;
    if (certProto === undefined) throw AppError.validation('A device certificate is required.');
    if (rosterProto === undefined) throw AppError.validation('The next signed roster is required.');
    if (signedPrekeyProto === undefined) throw AppError.validation('A signed prekey is required.');
    if (certProto.actorId !== actorId) {
      throw AppError.validation('Cannot enroll a device certificate for another actor.');
    }
    if (!DEVICE_ID_PATTERN.test(certProto.deviceId)) {
      throw AppError.validation('Device id must be a UUID-shaped identifier.');
    }

    // Before the transaction (issue #269), matching `sendEnvelopes`'s ordering: a budgeted-out
    // caller learns that without the roster-chain machinery running.
    await this.rateLimits.consumeIdentityWrite(actorId, peer);

    return this.dataSource.transaction(async (manager) => {
      const root = await loadActiveRoot(manager, actorId, { lock: true });
      const rootView = toIdentityRootView(root);

      const certView = buildCertificateView(certProto);
      assertBytesEqual(
        encodeCertificateTranscript({ ...certView, rootPublicKey: rootView.publicKey }),
        certView.certificateBytes,
        'Device certificate fields do not match the signed certificate transcript.',
      );
      try {
        verifyDeviceCertificate(certView, rootView, {
          verifier: e2eeSignatureVerifier,
          digest: e2eeDigest,
          now: new Date(),
          decodedMatchesTranscript: true,
        });
      } catch (error) {
        if (error instanceof E2eeContractError)
          throw new AppError('E2EE_CERTIFICATE_INVALID', error.message);
        throw error;
      }

      const existing = await manager.getRepository(E2eeDeviceIdentityEntity).findOne({
        where: { actorId, deviceId: certView.deviceId, revokedAt: IsNull() },
      });
      if (existing !== null) throw AppError.validation('This device is already enrolled.');

      const certificateDigest = e2eeDigest(certView.certificateBytes);

      // Saved before `appendRoster` (same transaction) so its own device-identity check
      // (`appendRoster` in `roster-chain.ts`, issue #268) sees this device as already certified
      // rather than needing a special-cased exception for the device being enrolled.
      const deviceRow = await manager.getRepository(E2eeDeviceIdentityEntity).save(
        manager.getRepository(E2eeDeviceIdentityEntity).create({
          actorId,
          identityRootId: root.id,
          deviceId: certView.deviceId,
          generation: certView.rootGeneration,
          signingPublicKey: Buffer.from(certView.signingPublicKey),
          agreementPublicKey: Buffer.from(certView.agreementPublicKey),
          certificateBytes: Buffer.from(certView.certificateBytes),
          rootSignature: Buffer.from(certView.rootSignature),
          certificateCreatedAt: certView.createdAt,
          expiresAt: certView.expiresAt,
          revokedAt: null,
        }),
      );

      const { row: rosterRow, entries } = await appendRoster(
        manager,
        actorId,
        rosterProto,
        rootView,
      );
      const matching = entries.find((entry) => entry.deviceId === certView.deviceId);
      if (matching === undefined || !matching.active) {
        throw AppError.validation(
          'The published roster does not list the enrolled device as active.',
        );
      }
      assertBytesEqual(
        matching.certificateDigest,
        certificateDigest,
        'The roster entry for this device does not match its certificate digest.',
      );

      await verifyAndSaveSignedPrekey(
        manager,
        deviceRow,
        certView,
        certificateDigest,
        signedPrekeyProto,
        request.prekeyBundleBytes,
        request.prekeyBundleSignature,
      );
      await saveOneTimePrekeys(manager, deviceRow.id, request.oneTimePrekeys, 0);

      return {
        certificate: toProtoCertificate(deviceRow, new Date()),
        roster: toProtoRoster(rosterRow, entries, rosterProto.rootGeneration),
      };
    });
  }

  async revokeDevice(
    actorId: string,
    request: RevokeDeviceRequest,
    peer: string | undefined = undefined,
  ): Promise<RevokeDeviceResponse> {
    const rosterProto = request.roster;
    if (rosterProto === undefined) throw AppError.validation('The next signed roster is required.');
    if (request.deviceId.length === 0) throw AppError.validation('A device id is required.');

    await this.rateLimits.consumeIdentityWrite(actorId, peer);

    return this.dataSource.transaction(async (manager) => {
      const root = await loadActiveRoot(manager, actorId, { lock: true });
      const device = await manager.getRepository(E2eeDeviceIdentityEntity).findOne({
        where: { actorId, deviceId: request.deviceId, revokedAt: IsNull() },
      });
      if (device === null) {
        throw new AppError(
          'E2EE_DEVICE_NOT_FOUND',
          'No active device with this id belongs to this actor.',
        );
      }

      const { row, entries } = await appendRoster(
        manager,
        actorId,
        rosterProto,
        toIdentityRootView(root),
      );
      const entry = entries.find((candidate) => candidate.deviceId === request.deviceId);
      if (entry === undefined || entry.active) {
        throw AppError.validation('The published roster must mark the revoked device inactive.');
      }

      device.revokedAt = new Date();
      await manager.getRepository(E2eeDeviceIdentityEntity).save(device);

      const deleted = await manager.getRepository(E2eeOneTimePrekeyEntity).delete({
        deviceIdentityId: device.id,
        consumedAt: IsNull(),
      });

      return {
        roster: toProtoRoster(row, entries, rosterProto.rootGeneration),
        deletedOneTimePrekeyCount: deleted.affected ?? 0,
      };
    });
  }

  async publishDeviceRoster(
    actorId: string,
    request: PublishDeviceRosterRequest,
    peer: string | undefined = undefined,
  ): Promise<PublishDeviceRosterResponse> {
    const rosterProto = request.roster;
    if (rosterProto === undefined) throw AppError.validation('A signed roster is required.');
    await this.rateLimits.consumeIdentityWrite(actorId, peer);
    return this.dataSource.transaction(async (manager) => {
      const root = await loadActiveRoot(manager, actorId, { lock: true });
      const { row, entries } = await appendRoster(
        manager,
        actorId,
        rosterProto,
        toIdentityRootView(root),
      );
      return { roster: toProtoRoster(row, entries, rosterProto.rootGeneration) };
    });
  }

  async getDeviceRoster(request: GetDeviceRosterRequest): Promise<GetDeviceRosterResponse> {
    const row = await loadCurrentRosterRow(this.dataSource.manager, request.actorId);
    if (row === null) {
      throw new AppError('E2EE_ROSTER_NOT_FOUND', 'This actor has not published a device roster.');
    }
    const decoded = decodeStoredRoster(row);
    const deviceIds = decoded.entries.map((entry) => entry.deviceId);
    const devices =
      deviceIds.length === 0
        ? []
        : await this.dataSource.getRepository(E2eeDeviceIdentityEntity).find({
            where: deviceIds.map((deviceId) => ({ actorId: request.actorId, deviceId })),
          });
    const now = new Date();
    return {
      roster: toProtoRoster(row, decoded.entries, decoded.rootGeneration),
      certificates: devices.map((device) => toProtoCertificate(device, now)),
    };
  }

  async listDeviceRosters(request: ListDeviceRostersRequest): Promise<ListDeviceRostersResponse> {
    const limit = clampListLimit(request.limit);
    const afterSequence = request.afterSequence.length === 0 ? 0n : BigInt(request.afterSequence);
    const cursorSequence =
      request.cursor.length === 0 ? afterSequence : decodeSequenceCursor(request.cursor);
    const startSequence = cursorSequence > afterSequence ? cursorSequence : afterSequence;

    const rows = await this.dataSource.getRepository(E2eeDeviceRosterEntity).find({
      where: { actorId: request.actorId, sequence: MoreThan(startSequence.toString()) },
      order: { sequence: 'ASC' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    return {
      rosters: page.map((row) => {
        const decoded = decodeStoredRoster(row);
        return toProtoRoster(row, decoded.entries, decoded.rootGeneration);
      }),
      page: {
        nextCursor:
          hasMore && last !== undefined ? encodeSequenceCursor(BigInt(last.sequence)) : '',
        hasMore,
      },
    };
  }
}

function buildCertificateView(
  certProto: NonNullable<EnrollDeviceRequest['certificate']>,
): E2eeDeviceCertificateView {
  return {
    actorId: certProto.actorId,
    deviceId: certProto.deviceId,
    rootGeneration: certProto.rootGeneration,
    certificateVersion: certProto.certificateVersion,
    signingPublicKey: toBytes(certProto.signingPublicKey),
    agreementPublicKey: toBytes(certProto.agreementPublicKey),
    supportedProtocolVersions: certProto.supportedProtocolVersions,
    createdAt: requireTimestamp(certProto.createdAt, 'Device certificate createdAt'),
    expiresAt: requireTimestamp(certProto.expiresAt, 'Device certificate expiresAt'),
    certificateBytes: toBytes(certProto.certificateBytes),
    rootSignature: toBytes(certProto.rootSignature),
    certificateDigest: toBytes(certProto.certificateDigest),
    status: 'ACTIVE',
  };
}

function verifyAndSaveSignedPrekey(
  manager: EntityManager,
  device: E2eeDeviceIdentityEntity,
  certView: E2eeDeviceCertificateView,
  certificateDigest: Uint8Array,
  signedPrekeyProto: NonNullable<EnrollDeviceRequest['signedPrekey']>,
  prekeyBundleBytes: Uint8Array,
  prekeyBundleSignature: Uint8Array,
): Promise<E2eeSignedPrekeyEntity> {
  const createdAt = requireTimestamp(signedPrekeyProto.createdAt, 'Signed prekey createdAt');
  const expiresAt = requireTimestamp(signedPrekeyProto.expiresAt, 'Signed prekey expiresAt');
  if (expiresAt.getTime() <= createdAt.getTime()) {
    throw AppError.validation('Signed prekey expiresAt must be after createdAt.');
  }
  const keyId = BigInt(signedPrekeyProto.keyId);
  if (keyId < 1n) throw AppError.validation('Signed prekey id must be positive.');

  const transcript = encodePrekeyBundleTranscript({
    certificateDigest,
    actorId: certView.actorId,
    deviceId: certView.deviceId,
    signedPrekeyId: keyId,
    signedPrekeyPublicKey: toBytes(signedPrekeyProto.publicKey),
    signedPrekeyCreatedAt: createdAt,
    signedPrekeyExpiresAt: expiresAt,
  });
  assertBytesEqual(
    transcript,
    toBytes(prekeyBundleBytes),
    'Prekey bundle does not match its transcript.',
  );
  if (
    !e2eeSignatureVerifier.verifyEd25519({
      publicKey: certView.signingPublicKey,
      message: transcript,
      signature: toBytes(prekeyBundleSignature),
    })
  ) {
    throw new AppError('E2EE_CERTIFICATE_INVALID', 'Prekey bundle signature does not verify.');
  }
  if (
    !e2eeSignatureVerifier.verifyEd25519({
      publicKey: certView.signingPublicKey,
      message: transcript,
      signature: toBytes(signedPrekeyProto.signature),
    })
  ) {
    throw new AppError('E2EE_CERTIFICATE_INVALID', 'Signed prekey signature does not verify.');
  }

  const repo = manager.getRepository(E2eeSignedPrekeyEntity);
  return repo.save(
    repo.create({
      deviceIdentityId: device.id,
      keyId: keyId.toString(),
      publicKey: Buffer.from(toBytes(signedPrekeyProto.publicKey)),
      signature: Buffer.from(toBytes(signedPrekeyProto.signature)),
      createdAt,
      expiresAt,
      retiredAt: null,
    }),
  );
}

async function saveOneTimePrekeys(
  manager: EntityManager,
  deviceIdentityId: string,
  prekeys: readonly { keyId: string; publicKey: Uint8Array }[],
  currentUnconsumedCount: number,
): Promise<number> {
  const capacity = Math.max(0, E2EE_ONE_TIME_PREKEY_TARGET - currentUnconsumedCount);
  // An explicit rejection, not the silent truncation this used to be (audit P2): a client
  // that uploaded more than the remaining inventory capacity must know its extra keys were
  // NOT stored — silent truncation made "uploaded 120" and "stored 100" look identical, and
  // the client would keep re-uploading keys it believes exist.
  if (prekeys.length > capacity) {
    throw AppError.validation(
      `This upload would exceed the one-time-prekey inventory target of ` +
        `${String(E2EE_ONE_TIME_PREKEY_TARGET)} per device ` +
        `(${String(currentUnconsumedCount)} unconsumed already; room for ${String(capacity)}).`,
    );
  }
  const accepted = prekeys.slice(0, capacity);
  if (accepted.length === 0) return 0;
  const repo = manager.getRepository(E2eeOneTimePrekeyEntity);
  try {
    // Reserve opaque IDs before public material is inserted. Both inserts use this transaction's
    // manager, so a duplicate reservation rolls back the whole upload (ADR 0031 §2).
    await manager.getRepository(E2eeOneTimePrekeyKeyIdEntity).insert(
      accepted.map((prekey) => ({
        deviceIdentityId,
        keyId: prekey.keyId,
        consumedAt: null,
      })),
    );
    await repo.insert(
      accepted.map((prekey) => ({
        deviceIdentityId,
        keyId: prekey.keyId,
        publicKey: Buffer.from(toBytes(prekey.publicKey)),
      })),
    );
  } catch (error) {
    // Only the immutable ledger's exact primary-key conflict is a client duplicate. Do not turn
    // connectivity, FK, datatype, or an unrelated unique violation into a misleading validation
    // response: those must retain their normal failure semantics and observability.
    if (isIssuedPrekeyLedgerDuplicate(error)) {
      throw AppError.validation('One-time prekey ids must be unique per device.', { cause: error });
    }
    throw error;
  }
  return accepted.length;
}

function isIssuedPrekeyLedgerDuplicate(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const postgres = error as { code?: unknown; constraint?: unknown };
  return (
    postgres.code === '23505' &&
    postgres.constraint === 'pk_e2ee_one_time_prekey_key_ids_device_identity_id_key_id'
  );
}

function clampListLimit(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.trunc(requested), MAX_LIST_LIMIT);
}

function encodeSequenceCursor(sequence: bigint): string {
  return Buffer.from(sequence.toString(), 'utf8').toString('base64url');
}

function decodeSequenceCursor(raw: string): bigint {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const value = BigInt(decoded);
    if (value < 0n) throw new Error('negative cursor');
    return value;
  } catch (error) {
    throw AppError.validation('Invalid pagination cursor.', { cause: error });
  }
}

export { saveOneTimePrekeys };
