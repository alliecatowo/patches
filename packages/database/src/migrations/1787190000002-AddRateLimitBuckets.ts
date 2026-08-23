import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * B-103: DB-backed rate limit buckets for global rate limiting (`INITIAL_VISION.md` §102).
 * When `RATE_LIMIT_GLOBAL=true`, the server uses this table instead of the in-memory store.
 * Buckets are keyed by a string identifier (e.g., "register:192.0.2.1") and track cost
 * within a time window. A background job cleans up expired buckets (where `window_end < NOW()`).
 *
 * `Phase6Admin1787062075716` (A-018) already created this table with the older
 * `count`/`expires_at` shape, so this migration reconciles it to the B-103 entity shape
 * with renames that preserve data (`count`→`cost`, `expires_at`→`window_end`) instead of
 * re-creating it — a `CREATE TABLE IF NOT EXISTS` here would be a silent no-op and leave
 * the schema diverged from the entity.
 */
export class AddRateLimitBuckets1787190000002 implements MigrationInterface {
  name = 'AddRateLimitBuckets1787190000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rate_limit_buckets" RENAME COLUMN "count" TO "cost";`);
    await queryRunner.query(
      `ALTER TABLE "rate_limit_buckets" RENAME COLUMN "expires_at" TO "window_end";`,
    );
    await queryRunner.query(
      `ALTER TABLE "rate_limit_buckets" ALTER COLUMN "window_start" SET DEFAULT now();`,
    );
    await queryRunner.query(`
      ALTER TABLE "rate_limit_buckets"
      ADD COLUMN "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_rate_limit_buckets_window_end"
        ON "rate_limit_buckets" ("window_end");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_rate_limit_buckets_window_end";`);
    await queryRunner.query(`ALTER TABLE "rate_limit_buckets" DROP COLUMN "updated_at";`);
    await queryRunner.query(
      `ALTER TABLE "rate_limit_buckets" ALTER COLUMN "window_start" DROP DEFAULT;`,
    );
    await queryRunner.query(
      `ALTER TABLE "rate_limit_buckets" RENAME COLUMN "window_end" TO "expires_at";`,
    );
    await queryRunner.query(`ALTER TABLE "rate_limit_buckets" RENAME COLUMN "cost" TO "count";`);
  }
}
