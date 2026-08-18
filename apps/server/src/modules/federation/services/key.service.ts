import { generateKeyPair } from 'node:crypto';
import { promisify } from 'node:util';

import { Injectable } from '@nestjs/common';
import {
  decryptFederationPrivateKeyPem,
  encryptFederationPrivateKeyPem,
  FederationKey,
} from '@patches/database';
import type { EntityManager } from 'typeorm';

import { AppConfigService } from '../../../config/app-config.service.js';

const generateKeyPairAsync = promisify(generateKeyPair);

/**
 * Local actors' own RSA-2048 keypairs (P8-005). Created lazily, once, the first time a local
 * actor needs to sign an outgoing request or publish an actor document with a `publicKey` —
 * most local actors in the two-node lab never federate, so eagerly minting a keypair for
 * every `Register` would be pure waste.
 *
 * `privateKeyPem` is encrypted at rest (B-026, AES-256-GCM under `FEDERATION_KEY_ENCRYPTION_
 * KEY`) — see `packages/database/src/crypto/federation-key-cipher.ts` for the cipher, shared
 * verbatim with `apps/worker`'s `FederationDeliverHandler`, which also needs to decrypt to
 * sign outgoing deliveries.
 */
@Injectable()
export class KeyService {
  constructor(private readonly config: AppConfigService) {}

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
      return { publicKeyPem: existing.publicKeyPem, privateKeyPem: this.decrypt(existing) };
    }

    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const encrypted = encryptFederationPrivateKeyPem(privateKey, this.encryptionKey());

    try {
      await repository.save(
        repository.create({
          actorId,
          publicKeyPem: publicKey,
          privateKeyCiphertext: encrypted.ciphertext,
          privateKeyIv: encrypted.iv,
          privateKeyTag: encrypted.tag,
        }),
      );
      return { publicKeyPem: publicKey, privateKeyPem: privateKey };
    } catch (error) {
      // Lost a race with a concurrent first-use of the same actor (unique PK on actor_id) —
      // the winner's keypair is the one every subsequent signature must agree on, so refetch
      // rather than proceed with a keypair nobody else will ever see again.
      if (!isUniqueViolation(error)) throw error;
      const winner = await repository.findOneOrFail({ where: { actorId } });
      return { publicKeyPem: winner.publicKeyPem, privateKeyPem: this.decrypt(winner) };
    }
  }

  private decrypt(key: FederationKey): string {
    return decryptFederationPrivateKeyPem(
      { ciphertext: key.privateKeyCiphertext, iv: key.privateKeyIv, tag: key.privateKeyTag },
      this.encryptionKey(),
    );
  }

  /** `envSchema`'s `superRefine` guarantees this is set whenever federation is enabled — the
   * only caller of `KeyService` is `ActivityPubFederationGateway`, which is only ever wired up
   * under that same flag (`federation.module.ts`), so reaching here with it unset would be a
   * configuration bug, not a normal runtime state. */
  private encryptionKey(): string {
    const key = this.config.federationKeyEncryptionKey;
    if (key === undefined) {
      throw new Error('FEDERATION_KEY_ENCRYPTION_KEY is not set.');
    }
    return key;
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
