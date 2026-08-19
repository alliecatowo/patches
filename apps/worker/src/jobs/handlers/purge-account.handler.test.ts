import type { AccountDeletionRequest } from '@patches/database';
import type { StorageClient } from '@patches/media';
import { describe, expect, it, vi } from 'vitest';

import { PurgeAccountHandler } from './purge-account.handler.js';

function fakeStorage(): StorageClient {
  return {
    presignPut: vi.fn(),
    presignGet: vi.fn(),
    head: vi.fn(),
    getObject: vi.fn(),
    putObject: vi.fn(),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
}

const actorId = '22222222-2222-4222-8222-222222222222';

/** Builds a fake `DataSource` whose `getRepository` always returns the same fake repo,
 * regardless of which entity is asked for — sufficient for the short-circuit branches
 * below, which never reach `Media`/`Actor`/etc. lookups. */
function fakeDataSourceWithDeletionRequest(row: AccountDeletionRequest | null): {
  findOne: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
} {
  const findOne = vi.fn().mockResolvedValue(row);
  const find = vi.fn().mockResolvedValue([]);
  const transaction = vi.fn();
  return { findOne, find, transaction };
}

describe('PurgeAccountHandler', () => {
  it('is a no-op when no deletion request row exists', async () => {
    const repo = fakeDataSourceWithDeletionRequest(null);
    const storage = fakeStorage();
    const handler = new PurgeAccountHandler(
      { getRepository: () => repo, transaction: repo.transaction } as never,
      storage,
    );

    await handler.handle({ actorId }, { jobId: '1', attempt: 1 });

    expect(repo.transaction).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('is a no-op when the deletion was cancelled before this job ran', async () => {
    const row = {
      actorId,
      requestedAt: new Date(),
      purgeAfter: new Date(),
      cancelledAt: new Date(),
      purgedAt: null,
    } as AccountDeletionRequest;
    const repo = fakeDataSourceWithDeletionRequest(row);
    const storage = fakeStorage();
    const handler = new PurgeAccountHandler(
      { getRepository: () => repo, transaction: repo.transaction } as never,
      storage,
    );

    await handler.handle({ actorId }, { jobId: '1', attempt: 1 });

    expect(repo.transaction).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('is a no-op on a second run once the account is already purged (idempotency)', async () => {
    const row = {
      actorId,
      requestedAt: new Date(),
      purgeAfter: new Date(),
      cancelledAt: null,
      purgedAt: new Date(),
    } as AccountDeletionRequest;
    const repo = fakeDataSourceWithDeletionRequest(row);
    const storage = fakeStorage();
    const handler = new PurgeAccountHandler(
      { getRepository: () => repo, transaction: repo.transaction } as never,
      storage,
    );

    await handler.handle({ actorId }, { jobId: '1', attempt: 1 });

    expect(repo.transaction).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('deletes the expanded purge scope (P14-024): bookmarks, reposts, community memberships, tag mutes, follow requests both directions, filter/labeler subscriptions, and export rows', async () => {
    const deletionRequestRow = {
      actorId,
      requestedAt: new Date(),
      purgeAfter: new Date(),
      cancelledAt: null,
      purgedAt: null,
    } as AccountDeletionRequest;

    /** Chainable fake for the `createQueryBuilder().delete().where(...).execute()` calls
     * (`Follow`, `FollowRequest`) — every method returns the same chain object. */
    function queryBuilderChain(): {
      delete: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      execute: ReturnType<typeof vi.fn>;
    } {
      const chain = {
        delete: vi.fn(() => chain),
        where: vi.fn(() => chain),
        execute: vi.fn().mockResolvedValue(undefined),
      };
      return chain;
    }

    const deleteCalls: Record<string, unknown[][]> = {};
    function fakeRepo(name: string): {
      findOne: ReturnType<typeof vi.fn>;
      find: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      save: ReturnType<typeof vi.fn>;
      createQueryBuilder: ReturnType<typeof vi.fn>;
    } {
      const delete_ = vi.fn((...args: unknown[]) => {
        (deleteCalls[name] ??= []).push(args);
        return Promise.resolve({});
      });
      return {
        findOne: vi
          .fn()
          .mockResolvedValue(
            name === 'Actor' ? { id: actorId, userId: null, deletedAt: null } : null,
          ),
        find: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
        delete: delete_,
        create: vi.fn((entity: unknown) => entity),
        save: vi.fn((entity: unknown) => Promise.resolve(entity)),
        createQueryBuilder: vi.fn(() => queryBuilderChain()),
      };
    }

    const outerRepos = new Map<string, ReturnType<typeof fakeRepo>>();
    const findOneDeletionRequest = vi.fn().mockResolvedValue(deletionRequestRow);
    const outerGetRepository = vi.fn((entity: { name: string }) => {
      if (entity.name === 'AccountDeletionRequest') {
        return { findOne: findOneDeletionRequest };
      }
      const repo = outerRepos.get(entity.name) ?? fakeRepo(entity.name);
      outerRepos.set(entity.name, repo);
      return repo;
    });

    // The transactional manager routes through the same `outerRepos` map as the outer
    // `dataSource`, so `deleteCalls` captures what happened inside the transaction too.
    const manager = {
      getRepository: vi.fn((entity: { name: string }) => {
        const repo = outerRepos.get(entity.name) ?? fakeRepo(entity.name);
        outerRepos.set(entity.name, repo);
        return repo;
      }),
    };

    const dataSource = {
      getRepository: outerGetRepository,
      transaction: vi.fn(async (fn: (manager: unknown) => Promise<void>) => fn(manager)),
    };
    const storage = fakeStorage();
    const handler = new PurgeAccountHandler(dataSource as never, storage);

    await handler.handle({ actorId }, { jobId: '1', attempt: 1 });

    for (const entityName of [
      'Bookmark',
      'Repost',
      'CommunityMember',
      'TagMute',
      'FilterListSubscription',
      'LabelerSubscription',
      'AccountExport',
      'Like',
    ]) {
      expect(deleteCalls[entityName], `${entityName}.delete was not called`).toEqual([
        [{ actorId }],
      ]);
    }
  });
});
