import { randomBytes } from 'node:crypto';

import { encryptFederationPrivateKeyPem, FederationKey } from '@patches/database';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../../config/app-config.service.js';
import { KeyService } from './key.service.js';

/**
 * B-026's "unit test round-trip" for `KeyService`'s at-rest encryption — a fake `EntityManager`
 * (same pattern as `inbox.service.test.ts`) rather than a real database, since the point here
 * is proving `KeyService` correctly encrypts on create and decrypts on read, not exercising
 * TypeORM itself.
 */

const ENCRYPTION_KEY = randomBytes(32).toString('base64');

function fakeConfig(): AppConfigService {
  return { federationKeyEncryptionKey: ENCRYPTION_KEY } as AppConfigService;
}

interface FakeFederationKeyRepo {
  findOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  findOneOrFail: ReturnType<typeof vi.fn>;
}

function fakeRepo(): FakeFederationKeyRepo {
  return {
    findOne: vi.fn(),
    create: vi.fn((input: Partial<FederationKey>) => input as FederationKey),
    save: vi.fn((input: FederationKey) => Promise.resolve(input)),
    findOneOrFail: vi.fn(),
  };
}

function fakeManager(repo: FakeFederationKeyRepo) {
  return {
    getRepository: (entity: unknown): unknown => {
      if (entity === FederationKey) return repo;
      throw new Error(`unexpected entity in fakeManager.getRepository: ${String(entity)}`);
    },
  };
}

describe('KeyService (B-026: private keys encrypted at rest)', () => {
  it('generates a keypair, stores it encrypted, and returns the plaintext PEM', async () => {
    const repo = fakeRepo();
    repo.findOne.mockResolvedValueOnce(null);
    const service = new KeyService(fakeConfig());

    const result = await service.getOrCreateKeyPair(fakeManager(repo) as never, 'actor-1');

    expect(result.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    const saved = repo.save.mock.calls[0]?.[0] as FederationKey;
    // Never stored in the clear — the plaintext PEM must not appear anywhere in what was
    // persisted (this is the whole point of B-026).
    expect(saved.privateKeyCiphertext.toString('utf8')).not.toContain('BEGIN PRIVATE KEY');
    expect(saved.privateKeyIv).toBeInstanceOf(Buffer);
    expect(saved.privateKeyTag).toBeInstanceOf(Buffer);
  });

  it('decrypts an existing row back to the exact PEM it was created with', async () => {
    const originalPem =
      '-----BEGIN PRIVATE KEY-----\nZmFrZS1rZXktbWF0ZXJpYWw=\n-----END PRIVATE KEY-----\n';
    const encrypted = encryptFederationPrivateKeyPem(originalPem, ENCRYPTION_KEY);
    const repo = fakeRepo();
    repo.findOne.mockResolvedValueOnce({
      actorId: 'actor-1',
      publicKeyPem: 'pub',
      privateKeyCiphertext: encrypted.ciphertext,
      privateKeyIv: encrypted.iv,
      privateKeyTag: encrypted.tag,
      createdAt: new Date(),
    } satisfies Partial<FederationKey>);
    const service = new KeyService(fakeConfig());

    const result = await service.getOrCreateKeyPair(fakeManager(repo) as never, 'actor-1');

    expect(result.privateKeyPem).toBe(originalPem);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
