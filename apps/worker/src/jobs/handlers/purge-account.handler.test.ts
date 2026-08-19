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
});
