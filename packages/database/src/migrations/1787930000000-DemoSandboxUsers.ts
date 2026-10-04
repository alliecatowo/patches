import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR 0044: per-visitor demo sandbox. Two additive nullable columns on `users` (every real
 * account keeps NULL for life) and a partial index the purge sweep reads. Additive and
 * nullable on purpose: Fly's bluegreen deploy runs `release_command` before the new machines
 * take traffic, so the previous release's code runs against this schema for a moment.
 */
export class DemoSandboxUsers1787930000000 implements MigrationInterface {
  name = 'DemoSandboxUsers1787930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "sandbox_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "sandbox_expires_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_sandbox_expires_at" ON "users" ("sandbox_expires_at") WHERE "sandbox_expires_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_users_sandbox_expires_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "sandbox_expires_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "sandbox_id"`);
  }
}
