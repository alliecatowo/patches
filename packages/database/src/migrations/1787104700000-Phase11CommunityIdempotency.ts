import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds the database backstop for CreateCommunity's §45 idempotency key. */
export class Phase11CommunityIdempotency1787104700000 implements MigrationInterface {
  name = 'Phase11CommunityIdempotency1787104700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "communities" ADD "client_request_id" uuid`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_communities_client_request_id_created_by_actor_id" ON "communities" ("created_by_actor_id", "client_request_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_communities_client_request_id_created_by_actor_id"`,
    );
    await queryRunner.query(`ALTER TABLE "communities" DROP COLUMN "client_request_id"`);
  }
}
