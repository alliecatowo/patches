import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * B-103: DB-backed rate limit buckets for global rate limiting (`INITIAL_VISION.md` §102).
 * When `RATE_LIMIT_GLOBAL=true`, the server uses this table instead of the in-memory store.
 * Buckets are keyed by a string identifier (e.g., "register:192.0.2.1") and track cost
 * within a time window. A background job cleans up expired buckets (where `window_end < NOW()`).
 */
export class AddRateLimitBuckets1787190000002 implements MigrationInterface {
  name = 'AddRateLimitBuckets1787190000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rate_limit_buckets" (
        "key" TEXT NOT NULL,
        "cost" INT NOT NULL DEFAULT 0,
        "window_start" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "window_end" TIMESTAMPTZ NOT NULL,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_rate_limit_buckets" PRIMARY KEY ("key", "window_start")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_rate_limit_buckets_window_end"
        ON "rate_limit_buckets" ("window_end");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_rate_limit_buckets_window_end";`);
    await queryRunner.query(`DROP TABLE "rate_limit_buckets";`);
  }
}
