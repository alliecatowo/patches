import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase14PrivacyAndFilters1787135113517 implements MigrationInterface {
  name = 'Phase14PrivacyAndFilters1787135113517';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "actor_privacy_prefs" ("actor_id" uuid NOT NULL, "discoverable" boolean NOT NULL DEFAULT true, "indexable" boolean NOT NULL DEFAULT true, "show_in_local_feed" boolean NOT NULL DEFAULT true, "locked" boolean NOT NULL DEFAULT false, "privacy_notice_version" integer, "privacy_notice_acknowledged_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "pk_actor_privacy_prefs_actor_id" PRIMARY KEY ("actor_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "filters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid NOT NULL, "name" text NOT NULL, "action" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_filters_action" CHECK ("action" IN ('HIDE', 'COLLAPSE', 'WARN')), CONSTRAINT "pk_filters_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_filters_actor_id" ON "filters"  ("actor_id") `);
    await queryRunner.query(
      `CREATE TABLE "filter_scopes" ("filter_id" uuid NOT NULL, "scope" text NOT NULL, CONSTRAINT "chk_filter_scopes_scope" CHECK ("scope" IN ('HOME', 'LOCAL', 'TAG_FEED', 'COMMUNITY_FEED', 'NOTIFICATIONS', 'SEARCH', 'MESSAGE_REQUESTS')), CONSTRAINT "pk_filter_scopes_filter_id_scope" PRIMARY KEY ("filter_id", "scope"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "filter_terms" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "filter_id" uuid NOT NULL, "kind" text NOT NULL, "value" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_filter_terms_kind" CHECK ("kind" IN ('SUBSTRING', 'WORD', 'TAG', 'ACTOR', 'DOMAIN')), CONSTRAINT "pk_filter_terms_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_filter_terms_filter_id" ON "filter_terms"  ("filter_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "actor_privacy_prefs" ADD CONSTRAINT "fk_actor_privacy_prefs_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "filters" ADD CONSTRAINT "fk_filters_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_scopes" ADD CONSTRAINT "fk_filter_scopes_filter_id" FOREIGN KEY ("filter_id") REFERENCES "filters"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_terms" ADD CONSTRAINT "fk_filter_terms_filter_id" FOREIGN KEY ("filter_id") REFERENCES "filters"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "filter_terms" DROP CONSTRAINT "fk_filter_terms_filter_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_scopes" DROP CONSTRAINT "fk_filter_scopes_filter_id"`,
    );
    await queryRunner.query(`ALTER TABLE "filters" DROP CONSTRAINT "fk_filters_actor_id"`);
    await queryRunner.query(
      `ALTER TABLE "actor_privacy_prefs" DROP CONSTRAINT "fk_actor_privacy_prefs_actor_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_filter_terms_filter_id"`);
    await queryRunner.query(`DROP TABLE "filter_terms"`);
    await queryRunner.query(`DROP TABLE "filter_scopes"`);
    await queryRunner.query(`DROP INDEX "public"."idx_filters_actor_id"`);
    await queryRunner.query(`DROP TABLE "filters"`);
    await queryRunner.query(`DROP TABLE "actor_privacy_prefs"`);
  }
}
