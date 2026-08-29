import { type MigrationInterface, type QueryRunner } from 'typeorm';

// `migration:generate` also picked up pre-existing drift on unrelated tables (`posts.tsv`,
// `rate_limit_buckets`'s primary key, an `e2ee_signed_prekeys` index rename) — the same drift the
// `E2eeIdentityRootTranscript1787790938656` migration's comment already documents. Trimmed by
// hand so this migration only touches `e2ee_device_link_offers`, per this task's owned-paths
// scope (issue #265, ADR 0037 §1).
export class E2eeDeviceLinkOffers1787816106996 implements MigrationInterface {
  name = 'E2eeDeviceLinkOffers1787816106996';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "e2ee_device_link_offers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid NOT NULL, "device_id" text NOT NULL, "offer_bytes" bytea NOT NULL, "device_signature" bytea NOT NULL, "signed_prekey_key_id" bigint NOT NULL, "signed_prekey_public_key" bytea NOT NULL, "signed_prekey_signature" bytea NOT NULL, "signed_prekey_created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "signed_prekey_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "prekey_bundle_bytes" bytea NOT NULL, "prekey_bundle_signature" bytea NOT NULL, "one_time_prekeys" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "chk_e2ee_device_link_offers_validity" CHECK ("expires_at" > "created_at"), CONSTRAINT "chk_e2ee_device_link_offers_signed_prekey_validity" CHECK ("signed_prekey_expires_at" > "signed_prekey_created_at"), CONSTRAINT "chk_e2ee_device_link_offers_signed_prekey_key_id" CHECK ("signed_prekey_key_id" > 0), CONSTRAINT "chk_e2ee_device_link_offers_prekey_bundle_signature_length" CHECK (octet_length("prekey_bundle_signature") = 64), CONSTRAINT "chk_e2ee_device_link_offers_device_signature_length" CHECK (octet_length("device_signature") = 64), CONSTRAINT "pk_e2ee_device_link_offers_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_device_link_offers_actor_id_device_id" ON "e2ee_device_link_offers"  ("actor_id", "device_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_e2ee_device_link_offers_actor_id_expires_at" ON "e2ee_device_link_offers"  ("actor_id", "expires_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_device_link_offers" ADD CONSTRAINT "fk_e2ee_device_link_offers_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "e2ee_device_link_offers" DROP CONSTRAINT "fk_e2ee_device_link_offers_actor_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_e2ee_device_link_offers_actor_id_expires_at"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_device_link_offers_actor_id_device_id"`);
    await queryRunner.query(`DROP TABLE "e2ee_device_link_offers"`);
  }
}
