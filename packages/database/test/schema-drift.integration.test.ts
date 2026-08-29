import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../src/data-source.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.warn(
    '[packages/database] Skipping schema-drift integration tests: TEST_DATABASE_URL is not set.',
  );
}

/**
 * Entity definitions and migrations must agree so a probe `db:generate --name=Probe` is empty:
 * any difference (a typing/rename/ephemeral mismatch) is a drift class that silently ships
 * schema-only and never reaches production until a deploy-time migrate double-checks it.
 * This test replays exactly what the TypeORM CLI's `migration:generate` does
 * (`dataSource.driver.createSchemaBuilder().log()`) against a fully-migrated database and
 * asserts that no upgrade queries are produced. It covers the drift classes that previously
 * diverged — a generated-column nullability, a hand-named partial index, and a composite
 * primary key — and guards every class that could recur.
 */
describe.skipIf(!testDatabaseUrl)('schema drift (integration, real Postgres)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createDataSource({ url: testDatabaseUrl! });
    await dataSource.initialize();
    await dataSource.dropDatabase();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('produces an empty schema diff once all migrations are applied', async () => {
    const schemaDiff = await dataSource.driver.createSchemaBuilder().log();
    expect(schemaDiff.upQueries).toEqual([]);
  });
});
