import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 8 two-node federation lab (`INITIAL_VISION.md` §105-110, `docs/architecture/
 * federation.md`, P8-001..P8-008): `federation_keys` (a local actor's own RSA-2048 keypair,
 * P8-005), `inbox_activities` (activity-id dedupe, P8-006), `domain_blocks` (P8-006), plus
 * three new `actors` columns (`public_key_pem`, `shared_inbox_uri`, `last_fetched_at`) that
 * round out the actor-document/remote-actor-caching shape §110 already anticipated with
 * `inbox_uri`/`outbox_uri`/`federation_state`. Generated with `pnpm db:generate`, reviewed,
 * then formatted (quote style, `import type`) to match the rest of this package — no SQL
 * changed from what the generator produced. `pnpm db:generate --name=Probe` against a
 * migrated database reports no further changes.
 */
export class Phase8Federation1787076396680 implements MigrationInterface {
  name = 'Phase8Federation1787076396680';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "domain_blocks" ("domain" text NOT NULL, "reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_domain_blocks_domain" PRIMARY KEY ("domain"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "federation_keys" ("actor_id" uuid NOT NULL, "public_key_pem" text NOT NULL, "private_key_pem" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_federation_keys_actor_id" PRIMARY KEY ("actor_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "inbox_activities" ("id" text NOT NULL, "activity_type" text NOT NULL, "actor_uri" text NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_inbox_activities_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_inbox_activities_received_at" ON "inbox_activities"  ("received_at") `,
    );
    await queryRunner.query(`ALTER TABLE "actors" ADD "public_key_pem" text`);
    await queryRunner.query(`ALTER TABLE "actors" ADD "shared_inbox_uri" text`);
    await queryRunner.query(`ALTER TABLE "actors" ADD "last_fetched_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `ALTER TABLE "federation_keys" ADD CONSTRAINT "fk_federation_keys_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "federation_keys" DROP CONSTRAINT "fk_federation_keys_actor_id"`,
    );
    await queryRunner.query(`ALTER TABLE "actors" DROP COLUMN "last_fetched_at"`);
    await queryRunner.query(`ALTER TABLE "actors" DROP COLUMN "shared_inbox_uri"`);
    await queryRunner.query(`ALTER TABLE "actors" DROP COLUMN "public_key_pem"`);
    await queryRunner.query(`DROP INDEX "public"."idx_inbox_activities_received_at"`);
    await queryRunner.query(`DROP TABLE "inbox_activities"`);
    await queryRunner.query(`DROP TABLE "federation_keys"`);
    await queryRunner.query(`DROP TABLE "domain_blocks"`);
  }
}
