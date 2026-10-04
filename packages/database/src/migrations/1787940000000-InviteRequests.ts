import type { MigrationInterface, QueryRunner } from 'typeorm';

/** ADR 0044: landing-page invite requests. A new table; nothing existing changes. */
export class InviteRequests1787940000000 implements MigrationInterface {
  name = 'InviteRequests1787940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "invite_requests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "contact" text NOT NULL, "contact_normalized" text NOT NULL, "message" text, "peer_hash" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "handled_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "pk_invite_requests_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_invite_requests_pending_contact" ON "invite_requests" ("contact_normalized") WHERE "handled_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_invite_requests_created_at" ON "invite_requests" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "invite_requests"`);
  }
}
