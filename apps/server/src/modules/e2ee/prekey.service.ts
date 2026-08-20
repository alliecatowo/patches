import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Block,
  E2eeDeviceIdentity as E2eeDeviceIdentityEntity,
  E2eeIdentityRoot as E2eeIdentityRootEntity,
  E2eeOneTimePrekey as E2eeOneTimePrekeyEntity,
  E2eeSignedPrekey as E2eeSignedPrekeyEntity,
} from '@patches/database';
import {
  E2EE_GROUP_MAX_MEMBERS,
  E2EE_ONE_TIME_PREKEY_REPLENISH_THRESHOLD,
  E2EE_ONE_TIME_PREKEY_TARGET,
  E2EE_SIGNED_PREKEY_ROTATION_MS,
} from '@patches/domain';
import {
  type ClaimPrekeyBundlesRequest,
  type ClaimPrekeyBundlesResponse,
  type E2eePrekeyBundle,
  type GetPrekeyInventoryRequest,
  type GetPrekeyInventoryResponse,
  type UploadPrekeysRequest,
  type UploadPrekeysResponse,
} from '@patches/proto';
import { DataSource, In, IsNull, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { saveOneTimePrekeys } from './device-roster.service.js';
import { e2eeDigest, e2eeSignatureVerifier } from './e2ee-crypto.adapter.js';
import {
  assertBytesEqual,
  encodePrekeyBundleTranscript,
  requireTimestamp,
  toBytes,
} from './e2ee.codec.js';
import { toProtoCertificate, toProtoRoster, toProtoSignedPrekey } from './e2ee.mapper.js';
import { decodeStoredRoster, loadCurrentRosterRow } from './roster-chain.js';

/**
 * ADR 0020 §5's drain rate limit: at most this many one-time-prekey claims consumed for one
 * device in the trailing window. Deliberately simple — a real limiter would use shared
 * counter/token-bucket infrastructure this codebase doesn't have yet — but it is a real,
 * enforced, per-request-checked bound, not a config knob a remote node could widen. Follow-up:
 * move it onto whatever shared rate-limit infrastructure `DmRateLimitService` generalizes into.
 */
const PREKEY_CLAIM_RATE_LIMIT = 30;
const PREKEY_CLAIM_RATE_WINDOW_MS = 60_000;
const MAX_CLAIM_ACTORS = E2EE_GROUP_MAX_MEMBERS;

interface ClaimedOneTimePrekey {
  readonly keyId: string;
  readonly publicKey: Buffer;
}

/**
 * `E2eeService.UploadPrekeys`/`GetPrekeyInventory`/`ClaimPrekeyBundles` (ADR 0020 §5, P13-005):
 * signed-prekey rotation, one-time-prekey top-up, and atomic claim/consume. The claim path is
 * the concurrency-critical one — `claimOneOneTimePrekey`'s `UPDATE ... WHERE id = (SELECT ...
 * FOR UPDATE SKIP LOCKED LIMIT 1)` is what makes "at most one one-time prekey per device per
 * call, never the same key twice" true under real concurrency, not just in the common case: two
 * concurrent claimants lock and consume *different* rows instead of both reading the same
 * "available" row and racing on the write.
 */
@Injectable()
export class E2eePrekeyService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async uploadPrekeys(
    actorId: string,
    request: UploadPrekeysRequest,
  ): Promise<UploadPrekeysResponse> {
    if (request.deviceId.length === 0) throw AppError.validation('A device id is required.');

    return this.dataSource.transaction(async (manager) => {
      const device = await manager.getRepository(E2eeDeviceIdentityEntity).findOne({
        where: { actorId, deviceId: request.deviceId, revokedAt: IsNull() },
      });
      if (device === null) {
        throw new AppError(
          'E2EE_DEVICE_NOT_FOUND',
          'No active device with this id belongs to this actor.',
        );
      }

      let activeSignedPrekey = await manager.getRepository(E2eeSignedPrekeyEntity).findOne({
        where: { deviceIdentityId: device.id, retiredAt: IsNull() },
      });

      const signedPrekeyProto = request.signedPrekey;
      if (signedPrekeyProto !== undefined) {
        activeSignedPrekey = await this.rotateSignedPrekey(
          manager,
          actorId,
          device,
          activeSignedPrekey,
          signedPrekeyProto,
          request.prekeyBundleBytes,
          request.prekeyBundleSignature,
        );
      }
      if (activeSignedPrekey === null) {
        throw AppError.validation(
          'Device has no active signed prekey; the first upload must include one.',
        );
      }

      const currentCount = await manager.getRepository(E2eeOneTimePrekeyEntity).count({
        where: { deviceIdentityId: device.id, consumedAt: IsNull() },
      });
      const inserted = await saveOneTimePrekeys(
        manager,
        device.id,
        request.oneTimePrekeys,
        currentCount,
      );

      return {
        oneTimePrekeyCount: currentCount + inserted,
        signedPrekey: toProtoSignedPrekey(activeSignedPrekey),
      };
    });
  }

  private async rotateSignedPrekey(
    manager: EntityManager,
    actorId: string,
    device: E2eeDeviceIdentityEntity,
    activeSignedPrekey: E2eeSignedPrekeyEntity | null,
    signedPrekeyProto: NonNullable<UploadPrekeysRequest['signedPrekey']>,
    prekeyBundleBytes: Uint8Array,
    prekeyBundleSignature: Uint8Array,
  ): Promise<E2eeSignedPrekeyEntity> {
    const createdAt = requireTimestamp(signedPrekeyProto.createdAt, 'Signed prekey createdAt');
    const expiresAt = requireTimestamp(signedPrekeyProto.expiresAt, 'Signed prekey expiresAt');
    if (expiresAt.getTime() <= createdAt.getTime()) {
      throw AppError.validation('Signed prekey expiresAt must be after createdAt.');
    }
    const nextKeyId = BigInt(signedPrekeyProto.keyId);
    if (nextKeyId < 1n) throw AppError.validation('Signed prekey id must be positive.');
    if (activeSignedPrekey !== null && nextKeyId <= BigInt(activeSignedPrekey.keyId)) {
      throw AppError.validation('A rotated signed prekey must advance the device key id.');
    }

    const certificateDigest = e2eeDigest(toBytes(device.certificateBytes));
    const transcript = encodePrekeyBundleTranscript({
      certificateDigest,
      agreementPublicKey: toBytes(device.agreementPublicKey),
      // Pinned to the empty string: the certificate's own advertised protocol versions are not
      // persisted per-device (see `e2ee.codec.ts`'s top-of-file comment), so `EnrollDevice` and
      // every later `UploadPrekeys` rotation both sign against this same fixed placeholder.
      protocolVersion: '',
      actorId,
      deviceId: device.deviceId,
      signedPrekeyId: nextKeyId,
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
        publicKey: toBytes(device.signingPublicKey),
        message: transcript,
        signature: toBytes(prekeyBundleSignature),
      })
    ) {
      throw new AppError(
        'E2EE_CERTIFICATE_INVALID',
        'Prekey bundle signature does not verify for this device.',
      );
    }

    if (activeSignedPrekey !== null) {
      activeSignedPrekey.retiredAt = new Date();
      await manager.getRepository(E2eeSignedPrekeyEntity).save(activeSignedPrekey);
    }
    const repo = manager.getRepository(E2eeSignedPrekeyEntity);
    return repo.save(
      repo.create({
        deviceIdentityId: device.id,
        keyId: nextKeyId.toString(),
        publicKey: Buffer.from(toBytes(signedPrekeyProto.publicKey)),
        signature: Buffer.from(toBytes(signedPrekeyProto.signature)),
        createdAt,
        expiresAt,
        retiredAt: null,
      }),
    );
  }

  async getPrekeyInventory(
    actorId: string,
    request: GetPrekeyInventoryRequest,
  ): Promise<GetPrekeyInventoryResponse> {
    if (request.deviceId.length === 0) throw AppError.validation('A device id is required.');
    const device = await this.dataSource.getRepository(E2eeDeviceIdentityEntity).findOne({
      where: { actorId, deviceId: request.deviceId, revokedAt: IsNull() },
    });
    if (device === null) {
      throw new AppError(
        'E2EE_DEVICE_NOT_FOUND',
        'No active device with this id belongs to this actor.',
      );
    }
    const [count, signedPrekey] = await Promise.all([
      this.dataSource.getRepository(E2eeOneTimePrekeyEntity).count({
        where: { deviceIdentityId: device.id, consumedAt: IsNull() },
      }),
      this.dataSource.getRepository(E2eeSignedPrekeyEntity).findOne({
        where: { deviceIdentityId: device.id, retiredAt: IsNull() },
      }),
    ]);
    if (signedPrekey === null) {
      throw AppError.internal('Active device has no active signed prekey.');
    }
    const rotationDue =
      signedPrekey.createdAt.getTime() + E2EE_SIGNED_PREKEY_ROTATION_MS <= Date.now();

    return {
      oneTimePrekeyCount: count,
      oneTimePrekeyTarget: E2EE_ONE_TIME_PREKEY_TARGET,
      replenishThreshold: E2EE_ONE_TIME_PREKEY_REPLENISH_THRESHOLD,
      oneTimePrekeysExhausted: count === 0,
      signedPrekey: toProtoSignedPrekey(signedPrekey),
      signedPrekeyRotationDue: rotationDue,
    };
  }

  async claimPrekeyBundles(
    actorId: string,
    request: ClaimPrekeyBundlesRequest,
  ): Promise<ClaimPrekeyBundlesResponse> {
    const targetActorIds = [...new Set(request.actorIds)];
    if (targetActorIds.length === 0)
      throw AppError.validation('At least one actor id is required.');
    if (targetActorIds.length > MAX_CLAIM_ACTORS) {
      throw AppError.validation(
        `At most ${String(MAX_CLAIM_ACTORS)} actors may be claimed in one call.`,
      );
    }
    const deviceFilter = request.deviceIds.length === 0 ? null : new Set(request.deviceIds);

    // Generic, no-oracle authorization (spec §62): the caller may not claim bundles for an
    // actor who blocks them or whom they block. `MessagesModule`'s richer mutual-follow/
    // accepted-request authorization for a *specific* conversation is intentionally not
    // duplicated here — `CreateE2eeConversation`/`GetE2eeConversationState` (not implemented by
    // this module; see `e2ee.controller.ts`) own that check, and until one of those RPCs exists
    // there is no conversation id a caller could legitimately supply anyway.
    const blocks =
      targetActorIds.length === 0
        ? []
        : await this.dataSource.getRepository(Block).find({
            where: [
              { blockerActorId: actorId, blockedActorId: In(targetActorIds) },
              { blockedActorId: actorId, blockerActorId: In(targetActorIds) },
            ],
          });
    const blockedActorIds = new Set(blocks.flatMap((b) => [b.blockerActorId, b.blockedActorId]));

    const bundles: E2eePrekeyBundle[] = [];
    const rosters: ClaimPrekeyBundlesResponse['rosters'] = [];

    for (const targetActorId of targetActorIds) {
      if (targetActorId !== actorId && blockedActorIds.has(targetActorId)) continue;

      const root = await this.dataSource
        .getRepository(E2eeIdentityRootEntity)
        .findOne({ where: { actorId: targetActorId, rotatedAt: IsNull() } });
      const rosterRow = await loadCurrentRosterRow(this.dataSource.manager, targetActorId);
      if (root === null || rosterRow === null) continue;

      const decoded = decodeStoredRoster(rosterRow);
      const activeEntries = decoded.entries.filter(
        (entry) => entry.active && (deviceFilter === null || deviceFilter.has(entry.deviceId)),
      );
      if (activeEntries.length === 0) continue;
      rosters.push(toProtoRoster(rosterRow, decoded.entries, decoded.rootGeneration));

      const devices = await this.dataSource.getRepository(E2eeDeviceIdentityEntity).find({
        where: activeEntries.map((entry) => ({
          actorId: targetActorId,
          deviceId: entry.deviceId,
          revokedAt: IsNull(),
        })),
      });

      for (const device of devices) {
        const signedPrekey = await this.dataSource.getRepository(E2eeSignedPrekeyEntity).findOne({
          where: { deviceIdentityId: device.id, retiredAt: IsNull() },
        });
        if (signedPrekey === null) continue;

        const oneTimePrekey = await this.claimOneOneTimePrekey(device.id);
        bundles.push(
          buildBundle(
            targetActorId,
            root.generation,
            toBytes(root.publicKey),
            device,
            signedPrekey,
            oneTimePrekey,
            BigInt(rosterRow.sequence),
            toBytes(rosterRow.digest),
          ),
        );
      }
    }

    return { bundles, rosters };
  }

  /**
   * Atomically removes at most one available one-time prekey for one device (ADR 0020 §5,
   * "the node never returns the same one-time prekey twice"). `FOR UPDATE SKIP LOCKED` inside
   * the subquery is what makes two concurrent callers race for *different* rows instead of
   * blocking on the same lock and both later acting on the same "available" row — the failure
   * mode a naive `SELECT` then `UPDATE`/`DELETE` pair would have.
   */
  private async claimOneOneTimePrekey(
    deviceIdentityId: string,
  ): Promise<ClaimedOneTimePrekey | null> {
    const recentClaims = await this.dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM e2ee_one_time_prekeys
       WHERE device_identity_id = $1 AND consumed_at IS NOT NULL
         AND consumed_at > now() - ($2 || ' milliseconds')::interval`,
      [deviceIdentityId, PREKEY_CLAIM_RATE_WINDOW_MS],
    );
    if ((recentClaims[0]?.count ?? 0) >= PREKEY_CLAIM_RATE_LIMIT) return null;

    const rows = await this.dataSource.query<{ key_id: string; public_key: Buffer }[]>(
      `UPDATE e2ee_one_time_prekeys
       SET consumed_at = now()
       WHERE id = (
         SELECT id FROM e2ee_one_time_prekeys
         WHERE device_identity_id = $1 AND consumed_at IS NULL
         ORDER BY id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING key_id, public_key`,
      [deviceIdentityId],
    );
    const row = rows[0];
    return row === undefined ? null : { keyId: row.key_id, publicKey: row.public_key };
  }
}

function buildBundle(
  targetActorId: string,
  rootGeneration: number,
  rootPublicKey: Uint8Array,
  device: E2eeDeviceIdentityEntity,
  signedPrekey: E2eeSignedPrekeyEntity,
  oneTimePrekey: ClaimedOneTimePrekey | null,
  rosterSequence: bigint,
  rosterDigest: Uint8Array,
): E2eePrekeyBundle {
  const certificateDigest = e2eeDigest(toBytes(device.certificateBytes));
  const bundleBytes = encodePrekeyBundleTranscript({
    certificateDigest,
    agreementPublicKey: toBytes(device.agreementPublicKey),
    protocolVersion: '',
    actorId: targetActorId,
    deviceId: device.deviceId,
    signedPrekeyId: BigInt(signedPrekey.keyId),
    signedPrekeyPublicKey: toBytes(signedPrekey.publicKey),
    signedPrekeyCreatedAt: signedPrekey.createdAt,
    signedPrekeyExpiresAt: signedPrekey.expiresAt,
  });
  return {
    actorId: targetActorId,
    deviceId: device.deviceId,
    rootGeneration,
    rootPublicKey: Buffer.from(rootPublicKey),
    deviceCertificate: toProtoCertificate(device, new Date()),
    signedPrekey: toProtoSignedPrekey(signedPrekey),
    oneTimePrekey:
      oneTimePrekey === null
        ? undefined
        : { keyId: oneTimePrekey.keyId, publicKey: oneTimePrekey.publicKey },
    oneTimePrekeyExhausted: oneTimePrekey === null,
    rosterSequence: rosterSequence.toString(),
    rosterDigest: Buffer.from(rosterDigest),
    bundleBytes: Buffer.from(bundleBytes),
    deviceSignature: signedPrekey.signature,
  };
}
