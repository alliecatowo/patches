import type { DataSource, EntityManager } from 'typeorm';

/**
 * Per-test isolation via a transaction that always rolls back — the fast path (no re-run
 * of migrations/seed between tests) recommended in `docs/research/typeorm-postgres.md` §6.
 *
 * `fn` receives the **transaction-scoped `EntityManager`** — use
 * `manager.getRepository(Entity)` (or `manager` directly) inside it, never
 * `dataSource.getRepository(Entity)`/`dataSource.manager`. Queries issued through the
 * injected/default repository run against the pool outside this transaction, so rollback
 * won't undo them (the same footgun documented for real transactional code in
 * `docs/research/typeorm-postgres.md` §4).
 *
 * Not a fit for code under test that opens its own nested transaction/savepoint — use
 * `truncateAll` between tests for that case instead.
 */
export async function withTransactionRollback<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    return await fn(queryRunner.manager);
  } finally {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  }
}
