import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MigrationExecutor } from 'typeorm';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../src/data-source.js';
import { ALL_MIGRATIONS } from '../src/migrations/index.js';
import { AppMeta } from '../src/entities/app-meta.entity.js';

// Never point tests at the dev DB (docs/agents/PACKAGE_CONVENTIONS.md, INITIAL_VISION.md
// §119) — this file only ever talks to TEST_DATABASE_URL, and skips cleanly if that isn't
// set rather than silently doing nothing or falling back to DATABASE_URL.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.warn(
    '[packages/database] Skipping integration tests: TEST_DATABASE_URL is not set. ' +
      'Copy .env.example to .env (or export TEST_DATABASE_URL) to run them against a real ' +
      'Postgres test database.',
  );
}

describe.skipIf(!testDatabaseUrl)('AppMeta + migrations (integration, real Postgres)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    // Non-null assertion is safe: describe.skipIf(!testDatabaseUrl) above means this body
    // never runs unless testDatabaseUrl is set.
    dataSource = createDataSource({ url: testDatabaseUrl! });
    await dataSource.initialize();
    // Tests own this schema outright: always start from nothing, regardless of what a
    // previous run (or a stale migration) left behind.
    await dataSource.dropDatabase();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('creates the app_meta table with snake_case columns via the migration', async () => {
    const queryRunner = dataSource.createQueryRunner();
    try {
      const table = await queryRunner.getTable('app_meta');
      expect(table).toBeDefined();
      const columnNames = table?.columns.map((column) => column.name).sort();
      expect(columnNames).toEqual(['key', 'updated_at', 'value']);
    } finally {
      await queryRunner.release();
    }
  });

  it('has zero pending migrations once run — the basis for the CI migration-validation check', async () => {
    const executor = new MigrationExecutor(dataSource);
    const pending = await executor.getPendingMigrations();
    expect(pending).toHaveLength(0);

    const executed = await executor.getExecutedMigrations();
    expect(executed.map((migration) => migration.name)).toContain('CreateAppMeta1755400000000');
  });

  it('writes and reads a row through the repository', async () => {
    const repository = dataSource.getRepository(AppMeta);
    await repository.insert({
      key: 'instance_id',
      value: { id: 'test-instance' },
      updatedAt: new Date(),
    });

    const found = await repository.findOneByOrFail({ key: 'instance_id' });
    expect(found.value).toEqual({ id: 'test-instance' });
  });

  it('refuses to roll back the irreversible issued-prekey ledger migration', async () => {
    expect(ALL_MIGRATIONS).toContain('AddE2eeIssuedPrekeyLedger1787617557448');
    await expect(dataSource.undoLastMigration()).rejects.toThrow(/irreversible/i);
    expect(await new MigrationExecutor(dataSource).getPendingMigrations()).toHaveLength(0);
  });
});
