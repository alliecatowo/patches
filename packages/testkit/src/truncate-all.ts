import type { DataSource } from 'typeorm';

/**
 * Truncates every table backing a registered entity (`RESTART IDENTITY CASCADE`). Prefer
 * `withTransactionRollback` for per-test isolation — reach for this only when the code
 * under test needs a real commit (e.g. it opens its own transaction/savepoint), per
 * `docs/research/typeorm-postgres.md` §6.
 */
export async function truncateAll(dataSource: DataSource): Promise<void> {
  const tableNames = dataSource.entityMetadatas.map((metadata) => `"${metadata.tableName}"`);
  if (tableNames.length === 0) return;
  await dataSource.query(`TRUNCATE TABLE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`);
}
