import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPgStatStatements1787190000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');
  }
  async down(_queryRunner: QueryRunner): Promise<void> {
    // Extension drops are destructive; no-op down for safety
  }
}
