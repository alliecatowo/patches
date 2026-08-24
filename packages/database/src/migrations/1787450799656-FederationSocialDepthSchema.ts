import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 18 schema for ADR 0028 (federating social depth) — schema only, no behavior:
 *
 * - `reposts.remote_activity_uri`: the activity id of the **remote** `Announce` an inbound
 *   repost arrived as, so a remote `Undo(Announce)` finds the pointer row by lookup. Unique
 *   (one remote activity id can never claim two local repost rows); null on locally
 *   originated reposts, whose outbound `Announce` ids are reconstructed from the row, never
 *   stored (ADR 0028 §4).
 * - `quote_authorizations`: the FEP-044f authorization lifecycle — issue/verify/revoke
 *   evidence for quotes, one row per (quoting post, quoted post) pair, revocation as a
 *   state flip rather than a delete (ADR 0028 §3/§6; `quote-authorization.entity.ts` for
 *   the full semantics).
 *
 * The generated file also emitted a phantom `filter_list_subscriptions.scopes` SET DEFAULT
 * pair (with a malformed down) unrelated to this change — stripped per ticket B-077; that
 * drift needs its own reconciliation.
 */
export class FederationSocialDepthSchema1787450799656 implements MigrationInterface {
  name = 'FederationSocialDepthSchema1787450799656';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "quote_authorizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quoted_post_id" uuid NOT NULL, "quoting_post_id" uuid, "quoter_actor_id" uuid NOT NULL, "remote_stamp_uri" text, "claimed_policy" text NOT NULL, "state" text NOT NULL, "verified_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_quote_authorizations_not_self" CHECK (quoting_post_id IS NULL OR quoting_post_id <> quoted_post_id), CONSTRAINT "chk_quote_authorizations_policy" CHECK ("claimed_policy" IN ('ANYONE', 'FOLLOWERS', 'NOBODY')), CONSTRAINT "chk_quote_authorizations_state" CHECK ("state" IN ('PENDING', 'VERIFIED', 'REVOKED', 'REJECTED')), CONSTRAINT "pk_quote_authorizations_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_quote_authorizations_quoted_post_id_state" ON "quote_authorizations"  ("quoted_post_id", "state") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_quote_authorizations_quoted_post_id_quoting_post_id" ON "quote_authorizations"  ("quoting_post_id", "quoted_post_id") `,
    );
    await queryRunner.query(`ALTER TABLE "reposts" ADD "remote_activity_uri" text`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_reposts_remote_activity_uri" ON "reposts"  ("remote_activity_uri") `,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_authorizations" ADD CONSTRAINT "fk_quote_authorizations_quoted_post_id" FOREIGN KEY ("quoted_post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_authorizations" ADD CONSTRAINT "fk_quote_authorizations_quoting_post_id" FOREIGN KEY ("quoting_post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_authorizations" ADD CONSTRAINT "fk_quote_authorizations_quoter_actor_id" FOREIGN KEY ("quoter_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quote_authorizations" DROP CONSTRAINT "fk_quote_authorizations_quoter_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_authorizations" DROP CONSTRAINT "fk_quote_authorizations_quoting_post_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_authorizations" DROP CONSTRAINT "fk_quote_authorizations_quoted_post_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_reposts_remote_activity_uri"`);
    await queryRunner.query(`ALTER TABLE "reposts" DROP COLUMN "remote_activity_uri"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_quote_authorizations_quoted_post_id_quoting_post_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_quote_authorizations_quoted_post_id_state"`);
    await queryRunner.query(`DROP TABLE "quote_authorizations"`);
  }
}
