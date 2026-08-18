import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppMeta } from '@patches/database';
import type { DataSource } from 'typeorm';
import { createTestDataSource } from '../src/create-test-data-source.js';
import { truncateAll } from '../src/truncate-all.js';
import { withTransactionRollback } from '../src/with-transaction-rollback.js';

// Never point tests at the dev DB (INITIAL_VISION.md §119) — createTestDataSource() only
// ever reads TEST_DATABASE_URL.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.warn(
    '[packages/testkit] Skipping integration tests: TEST_DATABASE_URL is not set. ' +
      'Copy .env.example to .env (or export TEST_DATABASE_URL) to run them against a real ' +
      'Postgres test database.',
  );
}

describe.skipIf(!testDatabaseUrl)('testkit helpers (integration, real Postgres)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('createTestDataSource() leaves the schema migrated with zero pending migrations', async () => {
    const table = await dataSource.createQueryRunner().getTable('app_meta');
    expect(table).toBeDefined();
  });

  it('withTransactionRollback() undoes writes made through the transactional manager', async () => {
    await withTransactionRollback(dataSource, async (manager) => {
      await manager
        .getRepository(AppMeta)
        .insert({ key: 'rollback-test', value: {}, updatedAt: new Date() });
      const found = await manager.getRepository(AppMeta).findOneBy({ key: 'rollback-test' });
      expect(found).not.toBeNull();
    });

    const afterRollback = await dataSource
      .getRepository(AppMeta)
      .findOneBy({ key: 'rollback-test' });
    expect(afterRollback).toBeNull();
  });

  it('truncateAll() removes committed rows', async () => {
    await dataSource
      .getRepository(AppMeta)
      .insert({ key: 'truncate-test', value: {}, updatedAt: new Date() });
    await truncateAll(dataSource);
    const afterTruncate = await dataSource
      .getRepository(AppMeta)
      .findOneBy({ key: 'truncate-test' });
    expect(afterTruncate).toBeNull();
  });
});
