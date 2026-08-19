import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase14AccountLifecycle1787135493158 implements MigrationInterface {
  name = 'Phase14AccountLifecycle1787135493158';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "account_deletion_requests" ("actor_id" uuid NOT NULL, "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL, "purge_after" TIMESTAMP WITH TIME ZONE NOT NULL, "cancelled_at" TIMESTAMP WITH TIME ZONE, "purged_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "pk_account_deletion_requests_actor_id" PRIMARY KEY ("actor_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "account_exports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid NOT NULL, "status" text NOT NULL DEFAULT 'PENDING', "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "ready_at" TIMESTAMP WITH TIME ZONE, "object_key" text, "expires_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_account_exports_status" CHECK ("status" IN ('PENDING', 'READY', 'FAILED', 'EXPIRED')), CONSTRAINT "pk_account_exports_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_account_exports_actor_id_requested_at" ON "account_exports"  ("actor_id", "requested_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "fk_account_deletion_requests_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_exports" ADD CONSTRAINT "fk_account_exports_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "account_exports" DROP CONSTRAINT "fk_account_exports_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_deletion_requests" DROP CONSTRAINT "fk_account_deletion_requests_actor_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_account_exports_actor_id_requested_at"`);
    await queryRunner.query(`DROP TABLE "account_exports"`);
    await queryRunner.query(`DROP TABLE "account_deletion_requests"`);
  }
}
