import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  E2eeDeviceIdentity as E2eeDeviceIdentityEntity,
  E2eeDeviceLinkOffer as E2eeDeviceLinkOfferEntity,
} from '@patches/database';
import { verifyDeviceLinkOffer } from '@patches/crypto';
import { dateToTimestamp } from '@patches/proto';
import {
  type E2eeDeviceLinkOffer as E2eeDeviceLinkOfferProto,
  type E2eeServiceBeginDeviceLinkRequest,
  type E2eeServiceBeginDeviceLinkResponse,
  type E2eeServiceCancelDeviceLinkRequest,
  type E2eeServiceCancelDeviceLinkResponse,
  type E2eeServiceListPendingDeviceLinksRequest,
  type E2eeServiceListPendingDeviceLinksResponse,
} from '@patches/proto/nest';
import { DataSource, IsNull, LessThanOrEqual, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import { requireTimestamp, toBytes } from './e2ee.codec.js';

/** Node caps every offer to at most this long, even if the offer itself claims a longer
 * validity window (ADR 0037 §1's "at most 10 minutes"). */
const MAX_OFFER_LIFETIME_MS = 10 * 60_000;

/** ADR 0037 §1: "at most 3 pending offers per actor." */
const MAX_PENDING_OFFERS_PER_ACTOR = 3;

/**
 * `E2eeService`'s device-link offer relay: `BeginDeviceLink`, `ListPendingDeviceLinks`,
 * `CancelDeviceLink` (ADR 0037 §1, issue #265). The node stores and relays exactly what it is
 * handed — `offerBytes`/`deviceSignature` are re-verified here only to reject garbage before it
 * occupies a pending slot, never trusted as authorization. The authority device that later signs
 * a certificate over this offer re-verifies the same bytes and derives its own SAS from them
 * (§3.3); this service never computes or checks a SAS.
 *
 * A pending offer is not a device: it never appears in a roster, fanout, or prekey inventory
 * (§3.4). `EnrollDevice` (`device-roster.service.ts`) deletes the matching offer, if any, once a
 * device is actually enrolled — see `deleteDeviceLinkOffer` below.
 */
@Injectable()
export class E2eeDeviceLinkService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rateLimits: E2eeRateLimitService,
  ) {}

  async beginDeviceLink(
    actorId: string,
    request: E2eeServiceBeginDeviceLinkRequest,
    peer: string | undefined = undefined,
  ): Promise<E2eeServiceBeginDeviceLinkResponse> {
    await this.rateLimits.consumeIdentityWrite(actorId, peer);

    const offerProto = request.offer;
    if (offerProto === undefined) throw AppError.validation('A device-link offer is required.');
    if (offerProto.actorId !== actorId) {
      throw AppError.validation('Cannot begin a device link for another actor.');
    }
    if (offerProto.deviceId.length === 0) {
      throw AppError.validation('A device link offer must name a device id.');
    }

    const now = new Date();
    const offerBytes = toBytes(offerProto.offerBytes);
    const deviceSignature = toBytes(offerProto.deviceSignature);

    let verified;
    try {
      verified = verifyDeviceLinkOffer({ offerBytes, deviceSignature, nowMs: now.getTime() });
    } catch (error) {
      throw new AppError(
        'E2EE_CERTIFICATE_INVALID',
        error instanceof Error ? error.message : 'Device link offer is invalid.',
        { cause: error },
      );
    }
    if (verified.actorId !== offerProto.actorId || verified.deviceId !== offerProto.deviceId) {
      throw new AppError(
        'E2EE_CERTIFICATE_INVALID',
        'Device link offer transcript does not match the requested actor/device.',
      );
    }

    const signedPrekeyProto = offerProto.signedPrekey;
    if (signedPrekeyProto === undefined) {
      throw AppError.validation('A device link offer must include a signed prekey.');
    }
    const signedPrekeyCreatedAt = requireTimestamp(
      signedPrekeyProto.createdAt,
      'Device link offer signed prekey createdAt',
    );
    const signedPrekeyExpiresAt = requireTimestamp(
      signedPrekeyProto.expiresAt,
      'Device link offer signed prekey expiresAt',
    );

    return this.dataSource.transaction(async (manager) => {
      const existingDevice = await manager.getRepository(E2eeDeviceIdentityEntity).findOne({
        where: { actorId, deviceId: offerProto.deviceId, revokedAt: IsNull() },
      });
      if (existingDevice !== null) {
        throw AppError.validation('This device is already enrolled.');
      }

      const offers = manager.getRepository(E2eeDeviceLinkOfferEntity);
      // Expired offers never occupy a pending slot; nor does a stale offer for the same
      // device, which this fresh call supersedes (ADR 0037 §1's per-device unique offer).
      await offers.delete({ actorId, expiresAt: LessThanOrEqual(now) });
      await offers.delete({ actorId, deviceId: offerProto.deviceId });

      const pendingCount = await offers.count({ where: { actorId } });
      if (pendingCount >= MAX_PENDING_OFFERS_PER_ACTOR) {
        throw AppError.validation('Too many pending device links; cancel one or wait for expiry.');
      }

      const cappedExpiresAtMs = Math.min(
        verified.expiresAtMs,
        now.getTime() + MAX_OFFER_LIFETIME_MS,
      );

      const row = await offers.save(
        offers.create({
          actorId,
          deviceId: offerProto.deviceId,
          offerBytes: Buffer.from(offerBytes),
          deviceSignature: Buffer.from(deviceSignature),
          signedPrekeyKeyId: signedPrekeyProto.keyId,
          signedPrekeyPublicKey: Buffer.from(toBytes(signedPrekeyProto.publicKey)),
          signedPrekeySignature: Buffer.from(toBytes(signedPrekeyProto.signature)),
          signedPrekeyCreatedAt,
          signedPrekeyExpiresAt,
          prekeyBundleBytes: Buffer.from(toBytes(offerProto.prekeyBundleBytes)),
          prekeyBundleSignature: Buffer.from(toBytes(offerProto.prekeyBundleSignature)),
          oneTimePrekeys: offerProto.oneTimePrekeys.map((prekey) => ({
            keyId: prekey.keyId,
            publicKey: Buffer.from(toBytes(prekey.publicKey)).toString('base64'),
          })),
          expiresAt: new Date(cappedExpiresAtMs),
        }),
      );

      return { linkId: row.id, expiresAt: dateToTimestamp(row.expiresAt) };
    });
  }

  async listPendingDeviceLinks(
    actorId: string,
    _request: E2eeServiceListPendingDeviceLinksRequest,
  ): Promise<E2eeServiceListPendingDeviceLinksResponse> {
    const repo = this.dataSource.getRepository(E2eeDeviceLinkOfferEntity);
    const now = new Date();
    await repo.delete({ actorId, expiresAt: LessThanOrEqual(now) });
    const rows = await repo.find({ where: { actorId }, order: { createdAt: 'ASC' } });
    return { offers: rows.map(toProtoDeviceLinkOffer) };
  }

  async cancelDeviceLink(
    actorId: string,
    request: E2eeServiceCancelDeviceLinkRequest,
  ): Promise<E2eeServiceCancelDeviceLinkResponse> {
    if (request.linkId.length === 0) throw AppError.validation('A link id is required.');
    // Idempotent: deleting an already-gone (expired, cancelled, or consumed) offer is not an
    // error — a caller cannot distinguish those cases from here, nor should it need to.
    await this.dataSource
      .getRepository(E2eeDeviceLinkOfferEntity)
      .delete({ id: request.linkId, actorId });
    return {};
  }
}

function toProtoDeviceLinkOffer(row: E2eeDeviceLinkOfferEntity): E2eeDeviceLinkOfferProto {
  return {
    linkId: row.id,
    actorId: row.actorId,
    deviceId: row.deviceId,
    offerBytes: row.offerBytes,
    deviceSignature: row.deviceSignature,
    signedPrekey: {
      keyId: row.signedPrekeyKeyId,
      publicKey: row.signedPrekeyPublicKey,
      signature: row.signedPrekeySignature,
      createdAt: dateToTimestamp(row.signedPrekeyCreatedAt),
      expiresAt: dateToTimestamp(row.signedPrekeyExpiresAt),
    },
    oneTimePrekeys: row.oneTimePrekeys.map((prekey) => ({
      keyId: prekey.keyId,
      publicKey: Buffer.from(prekey.publicKey, 'base64'),
    })),
    prekeyBundleBytes: row.prekeyBundleBytes,
    prekeyBundleSignature: row.prekeyBundleSignature,
    createdAt: dateToTimestamp(row.createdAt),
    expiresAt: dateToTimestamp(row.expiresAt),
  };
}

/**
 * Deletes the pending offer for (actorId, deviceId), if any — called from
 * `E2eeDeviceRosterService.enrollDevice` right after the device row is saved (ADR 0037 §1 step
 * 3: "It then deletes the offer."). A device enrolled without ever going through the link flow
 * (ordinary bootstrap) simply has no matching row, so this is a no-op there.
 */
export async function deleteDeviceLinkOffer(
  manager: EntityManager,
  actorId: string,
  deviceId: string,
): Promise<void> {
  await manager.getRepository(E2eeDeviceLinkOfferEntity).delete({ actorId, deviceId });
}
