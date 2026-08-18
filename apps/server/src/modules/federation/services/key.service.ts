import { generateKeyPair } from 'node:crypto';
import { promisify } from 'node:util';

import { Injectable } from '@nestjs/common';
import { FederationKey } from '@patches/database';
import type { EntityManager } from 'typeorm';

const generateKeyPairAsync = promisify(generateKeyPair);

/**
 * Local actors' own RSA-2048 keypairs (P8-005). Created lazily, once, the first time a local
 * actor needs to sign an outgoing request or publish an actor document with a `publicKey` —
 * most local actors in the two-node lab never federate, so eagerly minting a keypair for
 * every `Register` would be pure waste.
 *
 * See `FederationKey`'s doc comment for why `privateKeyPem` is stored plain (a documented
 * v0.1 gap, not an oversight).
 */
@Injectable()
export class KeyService {
  /**
   * Returns the actor's keypair, generating and persisting one on first use. Takes the
   * caller's `EntityManager` (not `@InjectDataSource`) so this can run inside the same
   * transaction as whatever triggered it (e.g. the first `publishPost` for a newly-followed
   * actor) without a second connection.
   */
  async getOrCreateKeyPair(
    manager: EntityManager,
    actorId: string,
  ): Promise<{ publicKeyPem: string; privateKeyPem: string }> {
    const repository = manager.getRepository(FederationKey);
    const existing = await repository.findOne({ where: { actorId } });
    if (existing !== null) {
      return { publicKeyPem: existing.publicKeyPem, privateKeyPem: existing.privateKeyPem };
    }

    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    try {
      await repository.save(
        repository.create({ actorId, publicKeyPem: publicKey, privateKeyPem: privateKey }),
      );
      return { publicKeyPem: publicKey, privateKeyPem: privateKey };
    } catch (error) {
      // Lost a race with a concurrent first-use of the same actor (unique PK on actor_id) —
      // the winner's keypair is the one every subsequent signature must agree on, so refetch
      // rather than proceed with a keypair nobody else will ever see again.
      if (!isUniqueViolation(error)) throw error;
      const winner = await repository.findOneOrFail({ where: { actorId } });
      return { publicKeyPem: winner.publicKeyPem, privateKeyPem: winner.privateKeyPem };
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
