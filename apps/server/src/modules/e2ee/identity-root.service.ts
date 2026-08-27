import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { E2eeIdentityRoot as E2eeIdentityRootEntity } from '@patches/database';
import {
  classifyIdentityRootChange,
  E2eeContractError,
  requiresReverification,
  verifyIdentityRoot,
  type E2eeIdentityRootView,
} from '@patches/domain';
import {
  type GetIdentityRootRequest,
  type GetIdentityRootResponse,
  type PublishIdentityRootRequest,
  type PublishIdentityRootResponse,
} from '@patches/proto';
import { DataSource, IsNull } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { e2eeSignatureVerifier } from './e2ee-crypto.adapter.js';
import { requireTimestamp, toBytes } from './e2ee.codec.js';
import { toProtoIdentityRoot, toProtoRoster } from './e2ee.mapper.js';
import { appendRoster, toIdentityRootView } from './roster-chain.js';

/**
 * `E2eeService.PublishIdentityRoot`/`GetIdentityRoot` (ADR 0020 §2–§3): the actor's messaging
 * identity root and its rotation history. The node stores and serves this key; it never
 * certifies it — proof of possession is the self-signature `verifyIdentityRoot` checks, not
 * anything this service asserts on its own authority.
 */
@Injectable()
export class E2eeIdentityRootService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  publishIdentityRoot(
    actorId: string,
    request: PublishIdentityRootRequest,
  ): Promise<PublishIdentityRootResponse> {
    const rootProto = request.identityRoot;
    if (rootProto === undefined) throw AppError.validation('An identity root is required.');
    if (rootProto.actorId !== actorId) {
      throw AppError.validation('Cannot publish an identity root for another actor.');
    }
    if (!Number.isInteger(rootProto.generation) || rootProto.generation < 1) {
      throw AppError.validation('Identity root generation must be a positive integer.');
    }

    const nextView: E2eeIdentityRootView = {
      actorId: rootProto.actorId,
      generation: rootProto.generation,
      publicKey: toBytes(rootProto.publicKey),
      rootBytes: toBytes(rootProto.rootBytes),
      selfSignature: toBytes(rootProto.selfSignature),
      previousRootSignature:
        rootProto.previousRootSignature.length === 0
          ? undefined
          : toBytes(rootProto.previousRootSignature),
    };

    try {
      verifyIdentityRoot(nextView, { verifier: e2eeSignatureVerifier });
    } catch (error) {
      if (error instanceof E2eeContractError)
        throw new AppError('E2EE_CERTIFICATE_INVALID', error.message);
      throw error;
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(E2eeIdentityRootEntity);
      const current = await repo.findOne({ where: { actorId, rotatedAt: IsNull() } });
      const previousView = current === null ? null : toIdentityRootView(current);

      let change;
      try {
        change = classifyIdentityRootChange(previousView, nextView, {
          verifier: e2eeSignatureVerifier,
        });
      } catch (error) {
        if (error instanceof E2eeContractError)
          throw new AppError('E2EE_CERTIFICATE_INVALID', error.message);
        throw error;
      }

      if (current !== null && !requiresReverification(change)) {
        // Idempotent replay of the currently active root: nothing to do.
        return { identityRoot: toProtoIdentityRoot(current), roster: undefined };
      }
      if (current === null && rootProto.generation !== 1) {
        throw AppError.validation('The first published identity root must be generation 1.');
      }

      if (current !== null) {
        current.rotatedAt = new Date();
        await repo.save(current);
      }

      const createdAt =
        rootProto.createdAt === undefined
          ? new Date()
          : requireTimestamp(rootProto.createdAt, 'Identity root createdAt');
      const saved = await repo.save(
        repo.create({
          actorId,
          generation: rootProto.generation,
          publicKey: Buffer.from(nextView.publicKey),
          rootBytes: Buffer.from(nextView.rootBytes),
          selfSignature: Buffer.from(nextView.selfSignature),
          previousRootSignature:
            nextView.previousRootSignature === undefined
              ? null
              : Buffer.from(nextView.previousRootSignature),
          createdAt,
          rotatedAt: null,
        }),
      );

      if (rootProto.generation === 1) {
        return { identityRoot: toProtoIdentityRoot(saved), roster: undefined };
      }

      const rosterProto = request.roster;
      if (rosterProto === undefined) {
        throw AppError.validation(
          'A root rotation must include the signed roster for the new root.',
        );
      }
      const rootView = toIdentityRootView(saved);
      const { row, entries } = await appendRoster(manager, actorId, rosterProto, rootView);
      return {
        identityRoot: toProtoIdentityRoot(saved),
        roster: toProtoRoster(row, entries, rosterProto.rootGeneration),
      };
    });
  }

  async getIdentityRoot(request: GetIdentityRootRequest): Promise<GetIdentityRootResponse> {
    const root = await this.dataSource
      .getRepository(E2eeIdentityRootEntity)
      .findOne({ where: { actorId: request.actorId, rotatedAt: IsNull() } });
    if (root === null) {
      throw new AppError(
        'E2EE_IDENTITY_ROOT_NOT_FOUND',
        'This actor has not published a messaging identity root.',
      );
    }
    return {
      identityRoot: toProtoIdentityRoot(root),
      // The node has no per-caller "last acknowledged generation" state — nothing in this
      // schema records one (`GetIdentityRootRequest` carries only `actor_id`). A client compares
      // the returned generation against what it has cached locally (ADR 0020 §3); this always
      // reporting `false` is honest about that rather than a fake per-caller computation.
      identityChangedSinceAcknowledged: false,
    };
  }
}
