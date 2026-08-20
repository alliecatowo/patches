import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../src/data-source.js';
import {
  latestNodeFrankingKey,
  loadNodeFrankingKeys,
  rotateNodeFrankingKey,
} from '../src/repositories/e2ee-node-franking-keys.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.warn(
    '[packages/database] Skipping e2ee-node-franking-keys integration tests: TEST_DATABASE_URL is not set.',
  );
}

describe.skipIf(!testDatabaseUrl)(
  'e2ee_node_franking_keys custody (integration, real Postgres, P13-015)',
  () => {
    let dataSource: DataSource;

    beforeAll(async () => {
      dataSource = createDataSource({ url: testDatabaseUrl! });
      await dataSource.initialize();
      await dataSource.runMigrations();
    });

    afterAll(async () => {
      await dataSource.destroy();
    });

    beforeEach(async () => {
      await dataSource.query('TRUNCATE TABLE "e2ee_node_franking_keys" RESTART IDENTITY CASCADE');
    });

    it('mints era 1 for the first rotation on an empty table', async () => {
      const key = await dataSource.transaction((manager) => rotateNodeFrankingKey(manager));
      expect(key.era).toBe(1);
      expect(key.keyMaterial).toHaveLength(32);
    });

    it('increases the era by exactly 1 on each rotation, never reusing or reassigning one', async () => {
      const first = await dataSource.transaction((manager) => rotateNodeFrankingKey(manager));
      const second = await dataSource.transaction((manager) => rotateNodeFrankingKey(manager));
      const third = await dataSource.transaction((manager) => rotateNodeFrankingKey(manager));

      expect([first.era, second.era, third.era]).toEqual([1, 2, 3]);
      expect(await latestNodeFrankingKey(dataSource.manager)).toMatchObject({ era: 3 });
    });

    it('rotation must not invalidate previously issued tags: every prior era stays resolvable (ADR 0020 §12.7)', async () => {
      const first = await dataSource.transaction((manager) => rotateNodeFrankingKey(manager));
      await dataSource.transaction((manager) => rotateNodeFrankingKey(manager));
      const third = await dataSource.transaction((manager) => rotateNodeFrankingKey(manager));

      const all = await loadNodeFrankingKeys(dataSource.manager);
      expect(all.map((row) => row.era)).toEqual([1, 2, 3]);
      // The oldest era's exact key material is still the one that was minted for it, not
      // overwritten or reset by later rotations.
      expect(all[0]?.keyMaterial).toEqual(first.keyMaterial);
      expect(all[2]?.keyMaterial).toEqual(third.keyMaterial);
    });

    it('returns undefined from latestNodeFrankingKey when no key has ever been minted', async () => {
      expect(await latestNodeFrankingKey(dataSource.manager)).toBeUndefined();
      expect(await loadNodeFrankingKeys(dataSource.manager)).toEqual([]);
    });
  },
);
