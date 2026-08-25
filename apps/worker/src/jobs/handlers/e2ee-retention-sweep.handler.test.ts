import { Logger } from '@nestjs/common';
import { e2eeRetentionDeletedTotal, e2eeRetentionRunsTotal } from '@patches/observability';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';

import {
  E2eeRetentionSweepHandler,
  E2EE_RETENTION_BATCH_SIZE,
} from './e2ee-retention-sweep.handler.js';

function fakeDataSource(
  idsByBatch: readonly string[][],
  insert = vi.fn().mockResolvedValue(undefined),
  failBatch?: number,
) {
  let batch = 0;
  const deletes: string[][] = [];
  const manager = {
    getRepository: () => ({
      createQueryBuilder: () => {
        const builder = {
          select: () => builder,
          where: () => builder,
          orderBy: () => builder,
          addOrderBy: () => builder,
          limit: (limit: number) => {
            expect(limit).toBe(E2EE_RETENTION_BATCH_SIZE);
            return builder;
          },
          setLock: (lock: string) => {
            expect(lock).toBe('pessimistic_write');
            return builder;
          },
          setOnLocked: (mode: string) => {
            expect(mode).toBe('skip_locked');
            return builder;
          },
          getRawMany: () => {
            const current = batch++;
            if (current === failBatch) return Promise.reject(new Error('later kind failed'));
            return Promise.resolve((idsByBatch[current] ?? []).map((id) => ({ id })));
          },
        };
        return builder;
      },
      insert,
    }),
    createQueryBuilder: () => {
      const builder = {
        delete: () => builder,
        from: () => builder,
        whereInIds: (ids: string[]) => {
          deletes.push(ids);
          return builder;
        },
        execute: () => Promise.resolve({ affected: deletes.at(-1)?.length ?? 0 }),
      };
      return builder;
    },
  } as unknown as EntityManager;
  return {
    dataSource: {
      transaction: (fn: (manager: EntityManager) => Promise<number>) => fn(manager),
      getRepository: () => ({ insert }),
    } as unknown as DataSource,
    deletes,
    insert,
  };
}

describe('E2eeRetentionSweepHandler', () => {
  it('uses bounded locked batches, schedules once, and logs aggregate counts only', async () => {
    const ids = Array.from(
      { length: E2EE_RETENTION_BATCH_SIZE },
      (_, index) => `id-${String(index)}`,
    );
    const fake = fakeDataSource([ids, [], []]);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const handler = new E2eeRetentionSweepHandler(fake.dataSource);

    await handler.handle(
      { scheduledFor: '2026-08-24T00:00:00.000Z' },
      { jobId: 'parent-job', attempt: 1 },
    );

    expect(fake.deletes).toEqual([ids]);
    expect(fake.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'E2EE_RETENTION_SWEEP',
        payload: { scheduledFor: '2026-08-25T00:00:00.000Z' },
        idempotencyKey: 'e2ee-retention-sweep:parent-job:2026-08-25T00:00:00.000Z',
      }),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"envelopes":500'));
    expect(log.mock.calls.flat().join(' ')).not.toContain('id-0');
    log.mockRestore();
  });

  it('treats only the successor idempotency-index conflict as an idempotent retry', async () => {
    const fake = fakeDataSource(
      [[], [], []],
      vi.fn().mockRejectedValue({ code: '23505', constraint: 'idx_outbox_jobs_idempotency_key' }),
    );
    await expect(
      new E2eeRetentionSweepHandler(fake.dataSource).handle(
        { scheduledFor: '2026-08-24T00:00:00.000Z' },
        { jobId: 'x', attempt: 2 },
      ),
    ).resolves.toBeUndefined();
  });

  it('rethrows unrelated PostgreSQL unique violations while scheduling a successor', async () => {
    const error = { code: '23505', constraint: 'some_other_unique_constraint' };
    const fake = fakeDataSource([[], [], []], vi.fn().mockRejectedValue(error));
    await expect(
      new E2eeRetentionSweepHandler(fake.dataSource).handle(
        { scheduledFor: '2026-08-24T00:00:00.000Z' },
        { jobId: 'x', attempt: 2 },
      ),
    ).rejects.toBe(error);
  });

  it('uses the persisted parent bucket after midnight, not the retry clock', async () => {
    const fake = fakeDataSource([[], [], []]);
    await new E2eeRetentionSweepHandler(fake.dataSource).handle(
      { scheduledFor: '2026-08-24T23:59:00.000Z' },
      { jobId: 'redelivered-parent', attempt: 2 },
    );
    expect(fake.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { scheduledFor: '2026-08-25T23:59:00.000Z' },
        idempotencyKey: 'e2ee-retention-sweep:redelivered-parent:2026-08-25T23:59:00.000Z',
      }),
    );
  });

  it('emits each committed kind once when a later kind transaction fails', async () => {
    const fake = fakeDataSource([['envelope'], ['prekey']], vi.fn(), 2);
    const deleted = vi.spyOn(e2eeRetentionDeletedTotal, 'inc').mockImplementation(() => undefined);
    const runs = vi.spyOn(e2eeRetentionRunsTotal, 'inc').mockImplementation(() => undefined);
    try {
      await expect(
        new E2eeRetentionSweepHandler(fake.dataSource).handle(
          { scheduledFor: '2026-08-24T00:00:00.000Z' },
          { jobId: 'partial-failure', attempt: 1 },
        ),
      ).rejects.toThrow('later kind failed');
      expect(deleted.mock.calls).toEqual([
        [{ kind: 'mailbox_envelope' }, 1],
        [{ kind: 'one_time_prekey' }, 1],
      ]);
      expect(runs).toHaveBeenCalledExactlyOnceWith({ outcome: 'failed' });
    } finally {
      deleted.mockRestore();
      runs.mockRestore();
    }
  });
});
