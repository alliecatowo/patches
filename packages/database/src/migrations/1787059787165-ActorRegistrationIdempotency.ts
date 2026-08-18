import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A-021 (`tasks.md`): the schema half of `AuthService.Register`'s idempotency key (spec §45).
 * `client_request_id` is nullable — see `Actor.clientRequestId`'s doc comment on why — and the
 * unique index is a plain expand: this is a pure additive column plus index, generated with
 * `pnpm db:generate` and reviewed with no hand-edits needed beyond formatting.
 *
 * A second, standalone migration rather than folded into `Phase4Interactions` in the same
 * change that discovered it: `Phase4Interactions` was already applied to the shared dev
 * database and pushed by the time A-021 was scoped in, and other agents may already have
 * pulled it (`docs/agents/LEARNINGS.md`'s concurrent-shared-checkout hazard) — editing an
 * already-applied, already-pushed migration is not safe to do after the fact.
 */
export class ActorRegistrationIdempotency1787059787165 implements MigrationInterface {
  name = 'ActorRegistrationIdempotency1787059787165';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "actors" ADD "client_request_id" uuid`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_actors_client_request_id_handle_normalized" ON "actors"  ("handle_normalized", "client_request_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_actors_client_request_id_handle_normalized"`);
    await queryRunner.query(`ALTER TABLE "actors" DROP COLUMN "client_request_id"`);
  }
}
