import { Actor, DomainBlock, FederationKey } from '@patches/database';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service.js';
import type { JobContext } from '../job-handler.js';
import { FederationDeliverHandler } from './federation-deliver.handler.js';

/** B-027's worker-side domain-block re-check — `DeliveryService.enqueue` already filters at
 * enqueue time (`apps/server`, out of this app's scope), so this only needs to prove the
 * handler bails out (without ever reaching the network) when a job's inbox host was blocked
 * *after* it was queued. */

function fakeConfig(): AppConfigService {
  return { federationKeyEncryptionKey: 'unused-in-this-test' } as AppConfigService;
}

interface Repo {
  findOne: ReturnType<typeof vi.fn>;
}

function fakeDataSource(repos: { actor: Repo; key: Repo; domainBlock: Repo }): {
  getRepository: (entity: unknown) => Repo;
} {
  return {
    getRepository: (entity: unknown): Repo => {
      if (entity === Actor) return repos.actor;
      if (entity === FederationKey) return repos.key;
      if (entity === DomainBlock) return repos.domainBlock;
      throw new Error(`unexpected entity in fakeDataSource.getRepository: ${String(entity)}`);
    },
  };
}

const PAYLOAD = {
  activityId: 'https://local.test/activities/1',
  inboxUrl: 'https://blocked.example/inbox',
  actorId: 'aaaaaaaa-0000-4000-8000-000000000001',
  activity: { id: 'https://local.test/activities/1', type: 'Create' },
};
const CTX: JobContext = { jobId: '1', attempt: 1 };

describe('FederationDeliverHandler domain-block re-check (B-027)', () => {
  it('skips delivery without querying the signer when the inbox host is blocked', async () => {
    const actorRepo: Repo = { findOne: vi.fn() };
    const keyRepo: Repo = { findOne: vi.fn() };
    const domainBlockRepo: Repo = {
      findOne: vi.fn().mockResolvedValue({ domain: 'blocked.example', reason: null }),
    };
    const dataSource = fakeDataSource({
      actor: actorRepo,
      key: keyRepo,
      domainBlock: domainBlockRepo,
    });
    const handler = new FederationDeliverHandler(dataSource as never, fakeConfig());

    await handler.handle(PAYLOAD, CTX);

    expect(domainBlockRepo.findOne).toHaveBeenCalledWith({
      where: { domain: 'blocked.example' },
    });
    expect(actorRepo.findOne).not.toHaveBeenCalled();
    expect(keyRepo.findOne).not.toHaveBeenCalled();
  });

  it('proceeds past the block check when the inbox host is not blocked', async () => {
    const actorRepo: Repo = { findOne: vi.fn().mockResolvedValue(null) };
    const keyRepo: Repo = { findOne: vi.fn().mockResolvedValue(null) };
    const domainBlockRepo: Repo = { findOne: vi.fn().mockResolvedValue(null) };
    const dataSource = fakeDataSource({
      actor: actorRepo,
      key: keyRepo,
      domainBlock: domainBlockRepo,
    });
    const handler = new FederationDeliverHandler(dataSource as never, fakeConfig());

    // Signer missing -> handler returns (SIGNER_MISSING), proving the block check let it
    // through to the next stage rather than swallowing every job.
    await handler.handle(PAYLOAD, CTX);

    expect(domainBlockRepo.findOne).toHaveBeenCalled();
    expect(actorRepo.findOne).toHaveBeenCalled();
  });
});
