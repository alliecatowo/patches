import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase14Labelers1787135294583 implements MigrationInterface {
  name = 'Phase14Labelers1787135294583';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "labelers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid, "community_id" uuid, "is_node_labeler" boolean NOT NULL DEFAULT false, "vocabulary" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_labelers_one_owner" CHECK (("actor_id" IS NOT NULL AND "community_id" IS NULL AND "is_node_labeler" = false)
   OR ("actor_id" IS NULL AND "community_id" IS NOT NULL AND "is_node_labeler" = false)
   OR ("actor_id" IS NULL AND "community_id" IS NULL AND "is_node_labeler" = true)), CONSTRAINT "pk_labelers_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "labels" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "labeler_id" uuid NOT NULL, "subject_type" text NOT NULL, "subject_actor_id" uuid, "subject_post_id" uuid, "value" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE, "retracted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_labels_subject_matches_type" CHECK (("subject_type" = 'ACTOR' AND "subject_actor_id" IS NOT NULL AND "subject_post_id" IS NULL)
   OR ("subject_type" = 'POST' AND "subject_post_id" IS NOT NULL AND "subject_actor_id" IS NULL)), CONSTRAINT "chk_labels_subject_type" CHECK ("subject_type" IN ('ACTOR', 'POST')), CONSTRAINT "pk_labels_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(
      `CREATE INDEX "idx_labels_labeler_id_subject_post_id" ON "labels"  ("labeler_id", "subject_post_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_labels_labeler_id_subject_actor_id" ON "labels"  ("labeler_id", "subject_actor_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "labeler_subscriptions" ("actor_id" uuid NOT NULL, "labeler_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_labeler_subscriptions_actor_id_labeler_id" PRIMARY KEY ("actor_id", "labeler_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "labeler_subscription_actions" ("actor_id" uuid NOT NULL, "labeler_id" uuid NOT NULL, "value" text NOT NULL, "action" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_labeler_subscription_actions_action" CHECK ("action" IN ('IGNORE', 'WARN', 'COLLAPSE', 'HIDE')), CONSTRAINT "pk_labeler_subscription_actions_actor_id_labeler_id_value" PRIMARY KEY ("actor_id", "labeler_id", "value"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "labelers" ADD CONSTRAINT "fk_labelers_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "labelers" ADD CONSTRAINT "fk_labelers_community_id" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "labels" ADD CONSTRAINT "fk_labels_labeler_id" FOREIGN KEY ("labeler_id") REFERENCES "labelers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "labels" ADD CONSTRAINT "fk_labels_subject_actor_id" FOREIGN KEY ("subject_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "labels" ADD CONSTRAINT "fk_labels_subject_post_id" FOREIGN KEY ("subject_post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "labeler_subscriptions" ADD CONSTRAINT "fk_labeler_subscriptions_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "labeler_subscriptions" ADD CONSTRAINT "fk_labeler_subscriptions_labeler_id" FOREIGN KEY ("labeler_id") REFERENCES "labelers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "labeler_subscription_actions" ADD CONSTRAINT "fk_labeler_subscription_actions_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "labeler_subscription_actions" ADD CONSTRAINT "fk_labeler_subscription_actions_labeler_id" FOREIGN KEY ("labeler_id") REFERENCES "labelers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "labeler_subscription_actions" DROP CONSTRAINT "fk_labeler_subscription_actions_labeler_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "labeler_subscription_actions" DROP CONSTRAINT "fk_labeler_subscription_actions_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "labeler_subscriptions" DROP CONSTRAINT "fk_labeler_subscriptions_labeler_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "labeler_subscriptions" DROP CONSTRAINT "fk_labeler_subscriptions_actor_id"`,
    );
    await queryRunner.query(`ALTER TABLE "labels" DROP CONSTRAINT "fk_labels_subject_post_id"`);
    await queryRunner.query(`ALTER TABLE "labels" DROP CONSTRAINT "fk_labels_subject_actor_id"`);
    await queryRunner.query(`ALTER TABLE "labels" DROP CONSTRAINT "fk_labels_labeler_id"`);
    await queryRunner.query(`ALTER TABLE "labelers" DROP CONSTRAINT "fk_labelers_community_id"`);
    await queryRunner.query(`ALTER TABLE "labelers" DROP CONSTRAINT "fk_labelers_actor_id"`);
    await queryRunner.query(`DROP TABLE "labeler_subscription_actions"`);
    await queryRunner.query(`DROP TABLE "labeler_subscriptions"`);
    await queryRunner.query(`DROP INDEX "public"."idx_labels_labeler_id_subject_actor_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_labels_labeler_id_subject_post_id"`);
    await queryRunner.query(`DROP TABLE "labels"`);
    await queryRunner.query(`DROP TABLE "labelers"`);
  }
}
