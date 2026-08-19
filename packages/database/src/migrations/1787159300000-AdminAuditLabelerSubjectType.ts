import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `chk_admin_audit_log_subject_type` to add `'LABELER'` (P14-026, `patches-admin
 * labeler vocabulary set-mandatory`) — hand-added, same as every prior widening of this
 * constraint (`1787082699518-Phase9Hardening.ts` adding `DOMAIN`,
 * `1787104600000-Phase11DirectMessagesModeration.ts` adding `COMMUNITY`):
 * `migration:generate`'s schema diff doesn't compare existing CHECK constraint bodies
 * (docs/agents/LEARNINGS.md), so this has to be hand-written rather than generated.
 */
export class AdminAuditLabelerSubjectType1787159300000 implements MigrationInterface {
  name = 'AdminAuditLabelerSubjectType1787159300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" DROP CONSTRAINT "chk_admin_audit_log_subject_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" ADD CONSTRAINT "chk_admin_audit_log_subject_type" CHECK ("subject_type" IN ('USER', 'INVITE', 'REPORT', 'POST', 'JOB', 'DOMAIN', 'COMMUNITY', 'LABELER'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" DROP CONSTRAINT "chk_admin_audit_log_subject_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" ADD CONSTRAINT "chk_admin_audit_log_subject_type" CHECK ("subject_type" IN ('USER', 'INVITE', 'REPORT', 'POST', 'JOB', 'DOMAIN', 'COMMUNITY'))`,
    );
  }
}
