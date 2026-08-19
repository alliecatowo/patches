import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase14FilterLists1787135204977 implements MigrationInterface {
  name = 'Phase14FilterLists1787135204977';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "filter_lists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_actor_id" uuid, "owner_community_id" uuid, "name" text NOT NULL, "display_name" text NOT NULL, "description" text NOT NULL DEFAULT '', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_filter_lists_one_owner" CHECK (("owner_actor_id" IS NOT NULL AND "owner_community_id" IS NULL) OR ("owner_actor_id" IS NULL AND "owner_community_id" IS NOT NULL)), CONSTRAINT "pk_filter_lists_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_filter_lists_name_owner_community_id" ON "filter_lists"  ("owner_community_id", "name") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_filter_lists_name_owner_actor_id" ON "filter_lists"  ("owner_actor_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "filter_list_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "filter_list_id" uuid NOT NULL, "kind" text NOT NULL, "value" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_filter_list_entries_kind" CHECK ("kind" IN ('SUBSTRING', 'WORD', 'TAG', 'ACTOR', 'DOMAIN')), CONSTRAINT "pk_filter_list_entries_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_filter_list_entries_filter_list_id" ON "filter_list_entries"  ("filter_list_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "filter_list_exceptions" ("actor_id" uuid NOT NULL, "filter_list_id" uuid NOT NULL, "filter_list_entry_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_filter_list_exceptions_actor_id_filter_list_entry_id_filter_" PRIMARY KEY ("actor_id", "filter_list_id", "filter_list_entry_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "filter_list_subscriptions" ("actor_id" uuid NOT NULL, "filter_list_id" uuid NOT NULL, "action" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_filter_list_subscriptions_action" CHECK ("action" IN ('HIDE', 'COLLAPSE', 'WARN')), CONSTRAINT "pk_filter_list_subscriptions_actor_id_filter_list_id" PRIMARY KEY ("actor_id", "filter_list_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_lists" ADD CONSTRAINT "fk_filter_lists_owner_actor_id" FOREIGN KEY ("owner_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_lists" ADD CONSTRAINT "fk_filter_lists_owner_community_id" FOREIGN KEY ("owner_community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_list_entries" ADD CONSTRAINT "fk_filter_list_entries_filter_list_id" FOREIGN KEY ("filter_list_id") REFERENCES "filter_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_list_exceptions" ADD CONSTRAINT "fk_filter_list_exceptions_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_list_exceptions" ADD CONSTRAINT "fk_filter_list_exceptions_filter_list_id" FOREIGN KEY ("filter_list_id") REFERENCES "filter_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_list_exceptions" ADD CONSTRAINT "fk_filter_list_exceptions_filter_list_entry_id" FOREIGN KEY ("filter_list_entry_id") REFERENCES "filter_list_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_list_subscriptions" ADD CONSTRAINT "fk_filter_list_subscriptions_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_list_subscriptions" ADD CONSTRAINT "fk_filter_list_subscriptions_filter_list_id" FOREIGN KEY ("filter_list_id") REFERENCES "filter_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "filter_list_subscriptions" DROP CONSTRAINT "fk_filter_list_subscriptions_filter_list_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_list_subscriptions" DROP CONSTRAINT "fk_filter_list_subscriptions_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_list_exceptions" DROP CONSTRAINT "fk_filter_list_exceptions_filter_list_entry_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_list_exceptions" DROP CONSTRAINT "fk_filter_list_exceptions_filter_list_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_list_exceptions" DROP CONSTRAINT "fk_filter_list_exceptions_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_list_entries" DROP CONSTRAINT "fk_filter_list_entries_filter_list_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_lists" DROP CONSTRAINT "fk_filter_lists_owner_community_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_lists" DROP CONSTRAINT "fk_filter_lists_owner_actor_id"`,
    );
    await queryRunner.query(`DROP TABLE "filter_list_subscriptions"`);
    await queryRunner.query(`DROP TABLE "filter_list_exceptions"`);
    await queryRunner.query(`DROP INDEX "public"."idx_filter_list_entries_filter_list_id"`);
    await queryRunner.query(`DROP TABLE "filter_list_entries"`);
    await queryRunner.query(`DROP INDEX "public"."idx_filter_lists_name_owner_actor_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_filter_lists_name_owner_community_id"`);
    await queryRunner.query(`DROP TABLE "filter_lists"`);
  }
}
