import { E2eeNodeFrankingKey } from '@patches/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';

import { DatabaseNodeFrankingKeyRing } from './node-franking-key-ring.js';

interface Row {
  era: number;
  keyMaterial: Buffer;
  createdAt: Date;
}

/** A fake `DataSource` whose `manager.getRepository(E2eeNodeFrankingKey).find()` returns
 * whatever `rows` currently holds — mutable so a test can simulate a rotation happening between
 * two `refresh()` calls without touching a real database. */
function fakeDataSource(rows: Row[]): DataSource {
  return {
    manager: {
      getRepository: (entity: unknown) => {
        if (entity !== E2eeNodeFrankingKey) {
          throw new Error(`No fake repository registered for ${String(entity)}`);
        }
        return {
          find: vi.fn().mockResolvedValue([...rows].sort((a, b) => a.era - b.era)),
        };
      },
    },
  } as unknown as DataSource;
}

describe('DatabaseNodeFrankingKeyRing (P13-015)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is empty before the first refresh', () => {
    const ring = new DatabaseNodeFrankingKeyRing(fakeDataSource([]));
    expect(ring.knownEras()).toEqual([]);
    expect(ring.currentEra()).toBeUndefined();
    expect(ring.keyForEra(1)).toBeUndefined();
  });

  it('loads every known era on refresh, resolving the highest as current', async () => {
    const rows: Row[] = [
      { era: 1, keyMaterial: Buffer.alloc(32, 1), createdAt: new Date('2026-01-01') },
      { era: 2, keyMaterial: Buffer.alloc(32, 2), createdAt: new Date('2026-02-01') },
    ];
    const ring = new DatabaseNodeFrankingKeyRing(fakeDataSource(rows));

    await ring.onModuleInit();

    expect(ring.knownEras()).toEqual([1, 2]);
    expect(ring.currentEra()).toBe(2);
    expect(ring.keyForEra(1)).toEqual(new Uint8Array(32).fill(1));
    expect(ring.keyForEra(2)).toEqual(new Uint8Array(32).fill(2));
    expect(ring.keyForEra(3)).toBeUndefined();

    ring.onModuleDestroy();
  });

  it('rotation must not invalidate previously issued tags: an old era stays resolvable after a newer one is minted (ADR 0020 §12.7)', async () => {
    const rows: Row[] = [{ era: 1, keyMaterial: Buffer.alloc(32, 1), createdAt: new Date() }];
    const dataSource = fakeDataSource(rows);
    const ring = new DatabaseNodeFrankingKeyRing(dataSource);
    await ring.onModuleInit();
    expect(ring.currentEra()).toBe(1);

    // A rotation happens out-of-band (e.g. the worker's job, in a different process) — simulated
    // here by mutating the row set the fake data source reads from.
    rows.push({ era: 2, keyMaterial: Buffer.alloc(32, 2), createdAt: new Date() });
    await ring.refresh();

    expect(ring.currentEra()).toBe(2);
    // Era 1 — the one that would have signed any tag issued before the rotation — is still
    // resolvable, not dropped just because it is no longer current.
    expect(ring.keyForEra(1)).toEqual(new Uint8Array(32).fill(1));
    expect(ring.knownEras()).toEqual([1, 2]);

    ring.onModuleDestroy();
  });

  it('periodically refreshes on its own without another explicit call', async () => {
    const rows: Row[] = [{ era: 1, keyMaterial: Buffer.alloc(32, 1), createdAt: new Date() }];
    const ring = new DatabaseNodeFrankingKeyRing(fakeDataSource(rows));
    await ring.onModuleInit();
    expect(ring.currentEra()).toBe(1);

    rows.push({ era: 2, keyMaterial: Buffer.alloc(32, 2), createdAt: new Date() });
    // Fire the periodic refresh timer without waiting out the real interval.
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(ring.currentEra()).toBe(2);
    ring.onModuleDestroy();
  });

  it('onModuleDestroy stops the periodic refresh', async () => {
    const rows: Row[] = [{ era: 1, keyMaterial: Buffer.alloc(32, 1), createdAt: new Date() }];
    const ring = new DatabaseNodeFrankingKeyRing(fakeDataSource(rows));
    await ring.onModuleInit();
    ring.onModuleDestroy();

    rows.push({ era: 2, keyMaterial: Buffer.alloc(32, 2), createdAt: new Date() });
    await vi.advanceTimersByTimeAsync(60 * 60_000);

    // No refresh happened after destroy — still stuck on the era seen at init.
    expect(ring.currentEra()).toBe(1);
  });
});
