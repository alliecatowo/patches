import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import type * as PatchesDatabase from '@patches/database';

vi.mock('@patches/database', async () => {
  const actual = await vi.importActual<typeof PatchesDatabase>('@patches/database');
  return {
    ...actual,
    latestNodeFrankingKey: vi.fn(),
    rotateNodeFrankingKey: vi.fn(),
  };
});

import { latestNodeFrankingKey, rotateNodeFrankingKey } from '@patches/database';
import {
  FRANKING_KEY_ROTATION_INTERVAL_MS,
  RotateE2eeFrankingKeyHandler,
} from './rotate-e2ee-franking-key.handler.js';

const latestMock = vi.mocked(latestNodeFrankingKey);
const rotateMock = vi.mocked(rotateNodeFrankingKey);

/** A fake `DataSource` whose `.transaction()` just invokes the callback with a fake manager
 * exposing an `OutboxJob` repository `insert` spy — sufficient for this handler, which only
 * ever touches `e2ee_node_franking_keys` (through the mocked repository functions above) and
 * `outbox_jobs` (through this repository). */
function fakeDataSource(insert: ReturnType<typeof vi.fn>): DataSource {
  const manager = { getRepository: () => ({ insert }) } as unknown as EntityManager;
  return {
    transaction: async (fn: (manager: EntityManager) => Promise<void>) => fn(manager),
  } as unknown as DataSource;
}

describe('RotateE2eeFrankingKeyHandler (ADR 0020 §9, §12.7, P13-015)', () => {
  beforeEach(() => {
    latestMock.mockReset();
    rotateMock.mockReset();
  });

  it('mints a new era when no key has ever been minted, then schedules the next occurrence', async () => {
    latestMock.mockResolvedValue(undefined);
    const minted = { era: 1, keyMaterial: Buffer.alloc(32, 1), createdAt: new Date('2026-08-01') };
    rotateMock.mockResolvedValue(minted);
    const insert = vi.fn().mockResolvedValue(undefined);
    const handler = new RotateE2eeFrankingKeyHandler(fakeDataSource(insert));

    await handler.handle({}, { jobId: '1', attempt: 1 });

    expect(rotateMock).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'E2EE_ROTATE_FRANKING_KEY',
        idempotencyKey: 'e2ee-franking-key-rotation-after-era-1',
        availableAt: new Date(minted.createdAt.getTime() + FRANKING_KEY_ROTATION_INTERVAL_MS),
      }),
    );
  });

  it('does not mint a second era when the latest key is still within the rotation interval (idempotent retry)', async () => {
    const fresh = {
      era: 3,
      keyMaterial: Buffer.alloc(32, 3),
      createdAt: new Date(Date.now() - 1000),
    };
    latestMock.mockResolvedValue(fresh);
    const insert = vi.fn().mockResolvedValue(undefined);
    const handler = new RotateE2eeFrankingKeyHandler(fakeDataSource(insert));

    await handler.handle({}, { jobId: '2', attempt: 2 });

    expect(rotateMock).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'e2ee-franking-key-rotation-after-era-3' }),
    );
  });

  it('mints a new era once the latest key is at least one rotation interval old', async () => {
    const stale = {
      era: 2,
      keyMaterial: Buffer.alloc(32, 2),
      createdAt: new Date(Date.now() - FRANKING_KEY_ROTATION_INTERVAL_MS - 1000),
    };
    latestMock.mockResolvedValue(stale);
    const minted = { era: 3, keyMaterial: Buffer.alloc(32, 3), createdAt: new Date() };
    rotateMock.mockResolvedValue(minted);
    const insert = vi.fn().mockResolvedValue(undefined);
    const handler = new RotateE2eeFrankingKeyHandler(fakeDataSource(insert));

    await handler.handle({}, { jobId: '3', attempt: 1 });

    expect(rotateMock).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'e2ee-franking-key-rotation-after-era-3' }),
    );
  });

  it('swallows a unique-violation when the next occurrence was already scheduled by a racing retry', async () => {
    latestMock.mockResolvedValue({
      era: 1,
      keyMaterial: Buffer.alloc(32, 1),
      createdAt: new Date(),
    });
    const insert = vi.fn().mockRejectedValue({ code: '23505' });
    const handler = new RotateE2eeFrankingKeyHandler(fakeDataSource(insert));

    await expect(handler.handle({}, { jobId: '4', attempt: 2 })).resolves.toBeUndefined();
  });

  it('rethrows a non-unique-violation failure while scheduling the next occurrence', async () => {
    latestMock.mockResolvedValue({
      era: 1,
      keyMaterial: Buffer.alloc(32, 1),
      createdAt: new Date(),
    });
    const insert = vi.fn().mockRejectedValue(new Error('connection reset'));
    const handler = new RotateE2eeFrankingKeyHandler(fakeDataSource(insert));

    await expect(handler.handle({}, { jobId: '5', attempt: 1 })).rejects.toThrow(
      'connection reset',
    );
  });

  it('rejects a non-empty payload', async () => {
    latestMock.mockResolvedValue(undefined);
    const handler = new RotateE2eeFrankingKeyHandler(fakeDataSource(vi.fn()));

    await expect(
      handler.handle({ unexpected: true }, { jobId: '6', attempt: 1 }),
    ).rejects.toThrow();
  });
});
