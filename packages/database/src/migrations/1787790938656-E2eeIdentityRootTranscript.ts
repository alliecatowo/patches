import { type MigrationInterface, type QueryRunner } from 'typeorm';

// `mise run db:generate` also picked up pre-existing drift on unrelated tables (`posts.tsv`,
// `rate_limit_buckets`'s primary key, an `e2ee_signed_prekeys` index rename) that predates this
// branch and isn't part of issue #251 — trimmed by hand so this migration only touches
// `e2ee_identity_roots`, per this task's owned-paths scope.
export class E2eeIdentityRootTranscript1787790938656 implements MigrationInterface {
  name = 'E2eeIdentityRootTranscript1787790938656';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "e2ee_identity_roots" ADD "root_bytes" bytea`);
    await queryRunner.query(`ALTER TABLE "e2ee_identity_roots" ADD "self_signature" bytea`);
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" ADD "previous_root_signature" bytea`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" ADD CONSTRAINT "chk_e2ee_identity_roots_previous_root_signature_length" CHECK ("previous_root_signature" IS NULL OR octet_length("previous_root_signature") = 64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" ADD CONSTRAINT "chk_e2ee_identity_roots_self_signature_length" CHECK ("self_signature" IS NULL OR octet_length("self_signature") = 64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" ADD CONSTRAINT "chk_e2ee_identity_roots_root_bytes_length" CHECK ("root_bytes" IS NULL OR octet_length("root_bytes") > 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" DROP CONSTRAINT "chk_e2ee_identity_roots_root_bytes_length"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" DROP CONSTRAINT "chk_e2ee_identity_roots_self_signature_length"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" DROP CONSTRAINT "chk_e2ee_identity_roots_previous_root_signature_length"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_identity_roots" DROP COLUMN "previous_root_signature"`,
    );
    await queryRunner.query(`ALTER TABLE "e2ee_identity_roots" DROP COLUMN "self_signature"`);
    await queryRunner.query(`ALTER TABLE "e2ee_identity_roots" DROP COLUMN "root_bytes"`);
  }
}
