import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P13-015 (ADR 0020 §9, §12.7): persisted node franking-key custody — `e2ee_node_franking_keys`,
 * one row per rotation era, appended only (see the entity's doc comment for why old eras are
 * never deleted or overwritten). Replaces the env-sourced `EnvNodeFrankingKeyRing` scaffolding
 * P13-009 left in place as a stand-in.
 *
 * The unrelated `filter_list_subscriptions.scopes` default-array diff `db:generate` also produced
 * here was stripped — same benign ordering-only diff `1787220000000-AddOidcCredentialType.ts`'s
 * doc comment already documents, not a real schema change.
 */
export class Phase13NodeFrankingKeys1787235748738 implements MigrationInterface {
  name = 'Phase13NodeFrankingKeys1787235748738';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "e2ee_node_franking_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "era" integer NOT NULL, "key_material" bytea NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_e2ee_node_franking_keys_key_length" CHECK (octet_length("key_material") = 32), CONSTRAINT "chk_e2ee_node_franking_keys_era" CHECK ("era" > 0), CONSTRAINT "pk_e2ee_node_franking_keys_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_e2ee_node_franking_keys_era" ON "e2ee_node_franking_keys" ("era")`,
    );

    // Seeds the very first `E2EE_ROTATE_FRANKING_KEY` occurrence so a node starts rotating
    // without any operator action — `apps/worker/src/jobs/handlers/rotate-e2ee-franking-key
    // .handler.ts` reschedules every subsequent occurrence itself. `available_at = now()` so the
    // first run happens (and mints era 1) on the next worker poll rather than waiting a full
    // rotation interval for a table that starts out empty. `ON CONFLICT DO NOTHING` makes this
    // migration itself idempotent under a retried run.
    await queryRunner.query(
      `INSERT INTO "outbox_jobs" ("type", "payload", "available_at", "idempotency_key")
       VALUES ('E2EE_ROTATE_FRANKING_KEY', '{}'::jsonb, now(), 'e2ee-franking-key-rotation-seed')
       ON CONFLICT ("idempotency_key") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "outbox_jobs" WHERE "idempotency_key" = 'e2ee-franking-key-rotation-seed'`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_e2ee_node_franking_keys_era"`);
    await queryRunner.query(`DROP TABLE "e2ee_node_franking_keys"`);
  }
}
