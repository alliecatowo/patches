import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddE2eeIssuedPrekeyLedger1787617557448 implements MigrationInterface {
  name = 'AddE2eeIssuedPrekeyLedger1787617557448';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "e2ee_one_time_prekey_key_ids" ("device_identity_id" uuid NOT NULL, "key_id" bigint NOT NULL, "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "consumed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_e2ee_one_time_prekey_key_ids_key_id" CHECK ("key_id" > 0), CONSTRAINT "pk_e2ee_one_time_prekey_key_ids_device_identity_id_key_id" PRIMARY KEY ("device_identity_id", "key_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "e2ee_one_time_prekey_key_ids" ("device_identity_id", "key_id", "issued_at", "consumed_at") SELECT "device_identity_id", "key_id", "uploaded_at", "consumed_at" FROM "e2ee_one_time_prekeys"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_one_time_prekey_key_ids" ADD CONSTRAINT "fk_e2ee_one_time_prekey_key_ids_device_identity_id" FOREIGN KEY ("device_identity_id") REFERENCES "e2ee_device_identities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_one_time_prekeys" ADD CONSTRAINT "fk_e2ee_one_time_prekeys_device_identity_id_key_id" FOREIGN KEY ("device_identity_id", "key_id") REFERENCES "e2ee_one_time_prekey_key_ids"("device_identity_id", "key_id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_e2ee_mailbox_envelopes_acknowledged_at_id" ON "e2ee_mailbox_envelopes" ("acknowledged_at", "id") WHERE "acknowledged_at" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_e2ee_one_time_prekeys_consumed_at_id" ON "e2ee_one_time_prekeys" ("consumed_at", "id") WHERE "consumed_at" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_e2ee_signed_prekeys_retired_at_id" ON "e2ee_signed_prekeys" ("retired_at", "id") WHERE "retired_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_signed_prekeys_retired_at_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_one_time_prekeys_consumed_at_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_mailbox_envelopes_acknowledged_at_id"`);
    // The prekey table depends on the issued-ID ledger. Remove that dependent FK before
    // removing the ledger's own device-identity FK and table.
    await queryRunner.query(
      `ALTER TABLE "e2ee_one_time_prekeys" DROP CONSTRAINT "fk_e2ee_one_time_prekeys_device_identity_id_key_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "e2ee_one_time_prekey_key_ids" DROP CONSTRAINT "fk_e2ee_one_time_prekey_key_ids_device_identity_id"`,
    );
    await queryRunner.query(`DROP TABLE "e2ee_one_time_prekey_key_ids"`);
  }
}
