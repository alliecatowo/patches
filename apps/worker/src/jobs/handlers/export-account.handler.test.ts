import type { AccountExport } from '@patches/database';
import type { StorageClient } from '@patches/media';
import { describe, expect, it, vi } from 'vitest';

import { ExportAccountHandler } from './export-account.handler.js';

function fakeStorage(): StorageClient {
  return {
    presignPut: vi.fn(),
    presignGet: vi.fn(),
    head: vi.fn(),
    getObject: vi.fn(),
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
}

const payload = {
  exportId: '11111111-1111-4111-8111-111111111111',
  actorId: '22222222-2222-4222-8222-222222222222',
};

describe('ExportAccountHandler', () => {
  it('is a no-op when the export row no longer exists (idempotent redelivery)', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const storage = fakeStorage();
    const handler = new ExportAccountHandler(
      { getRepository: () => ({ findOne }) } as never,
      storage,
    );

    await handler.handle(payload, { jobId: '1', attempt: 1 });

    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('is a no-op when the row is no longer PENDING (already READY/FAILED/EXPIRED)', async () => {
    const ready = { id: payload.exportId, status: 'READY' } as AccountExport;
    const findOne = vi.fn().mockResolvedValue(ready);
    const storage = fakeStorage();
    const handler = new ExportAccountHandler(
      { getRepository: () => ({ findOne }) } as never,
      storage,
    );

    await handler.handle(payload, { jobId: '1', attempt: 1 });

    expect(storage.putObject).not.toHaveBeenCalled();
  });
});
