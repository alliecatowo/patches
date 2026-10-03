import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../../config/app-config.service.js';
import { RemoteActorService, RemoteFetchError } from './remote-actor.service.js';
import { safeFetch } from '../security/safe-fetch.js';
import type * as SafeFetchModule from '../security/safe-fetch.js';

vi.mock('../security/safe-fetch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SafeFetchModule>();
  return { ...actual, safeFetch: vi.fn() };
});

const safeFetchMock = vi.mocked(safeFetch);

function respond(doc: unknown, finalUrl: string): void {
  safeFetchMock.mockResolvedValue({
    status: 200,
    headers: { 'content-type': 'application/activity+json' },
    body: Buffer.from(JSON.stringify(doc), 'utf8'),
    finalUrl,
  });
}

function makeManager() {
  const repository = {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn((value: object) => value),
    save: vi.fn((value: object) => Promise.resolve(value)),
    update: vi.fn(),
    findOneOrFail: vi.fn(),
  };
  return { repository, manager: { getRepository: () => repository } as never };
}

describe('RemoteActorService identity binding (S-C1)', () => {
  let service: RemoteActorService;

  beforeEach(() => {
    safeFetchMock.mockReset();
    service = new RemoteActorService({ isProduction: true } as AppConfigService);
  });

  it('stores an honest actor under the fetched URI', async () => {
    const uri = 'https://remote.example/users/alice';
    respond(
      {
        id: uri,
        preferredUsername: 'alice',
        inbox: `${uri}/inbox`,
        publicKey: { publicKeyPem: 'PEM' },
      },
      uri,
    );
    const { manager, repository } = makeManager();
    await service.getOrFetchByUri(manager, uri);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalUri: uri, publicKeyPem: 'PEM' }),
    );
  });

  it('rejects a document whose id claims a different actor (key poisoning)', async () => {
    respond(
      {
        id: 'https://victim.example/users/alice',
        preferredUsername: 'alice',
        inbox: 'https://evil.example/inbox',
        publicKey: { publicKeyPem: 'ATTACKER' },
      },
      'https://evil.example/actor',
    );
    const { manager, repository } = makeManager();
    await expect(service.getOrFetchByUri(manager, 'https://evil.example/actor')).rejects.toThrow(
      RemoteFetchError,
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects a redirect to another origin that echoes the requested id', async () => {
    const uri = 'https://remote.example/users/alice';
    respond({ id: uri, inbox: `${uri}/inbox` }, 'https://evil.example/users/alice');
    const { manager, repository } = makeManager();
    await expect(service.getOrFetchByUri(manager, uri)).rejects.toThrow(RemoteFetchError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('accepts a same-origin redirect to the canonical id', async () => {
    const canonical = 'https://remote.example/users/alice';
    respond({ id: canonical, inbox: `${canonical}/inbox` }, canonical);
    const { manager, repository } = makeManager();
    await service.getOrFetchByUri(manager, 'https://remote.example/@alice');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalUri: canonical }),
    );
  });
});
