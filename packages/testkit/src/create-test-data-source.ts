import { createDataSource } from '@patches/database';
import type { DataSource } from 'typeorm';

/**
 * Builds and initializes a DataSource against `TEST_DATABASE_URL`, drops any existing
 * schema, and runs every migration — so each test run starts from a known, fully-migrated
 * state regardless of what a previous run left behind. Never reads `DATABASE_URL` — tests
 * must never point at the dev database (INITIAL_VISION.md §119).
 */
export async function createTestDataSource(): Promise<DataSource> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Copy .env.example to .env at the repo root (or export ' +
        'TEST_DATABASE_URL) before using @patches/testkit.',
    );
  }

  const dataSource = createDataSource({ url });
  await dataSource.initialize();
  await dataSource.dropDatabase();
  await dataSource.runMigrations();
  return dataSource;
}
