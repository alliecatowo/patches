import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4/6 interactions: `likes`, `bookmarks`, `notifications`, `reports`
 * (`INITIAL_VISION.md` §53, §56, §64, §113). Generated with `pnpm db:generate` from the
 * entities, then reviewed and hand-edited in exactly two ways, following `Phase3SocialGraph`'s
 * precedent:
 *
 * 1. `uuid_generate_v4()` -> `gen_random_uuid()` on `notifications.id`/`reports.id` — no
 *    `uuid-ossp` extension is ever installed (same reasoning as `Phase1Schema`).
 * 2. Import style/formatting, to satisfy lint and prettier.
 *
 * `notifications`'s two partial unique indexes are the dedupe backstop described on the
 * `Notification` entity — split because a plain unique index cannot dedupe rows where
 * `post_id IS NULL` (every `FOLLOW` notification).
 *
 * Nothing else was changed: `pnpm db:generate --name=Probe` against a migrated database
 * reports no further changes.
 */
export class Phase4Interactions1787058326261 implements MigrationInterface {
  name = 'Phase4Interactions1787058326261';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "bookmarks" ("actor_id" uuid NOT NULL, "post_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_bookmarks_actor_id_post_id" PRIMARY KEY ("actor_id", "post_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bookmarks_actor_id_created_at_post_id" ON "bookmarks"  ("actor_id", "created_at", "post_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "likes" ("actor_id" uuid NOT NULL, "post_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_likes_actor_id_post_id" PRIMARY KEY ("actor_id", "post_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_likes_actor_id_created_at_post_id" ON "likes"  ("post_id", "created_at", "actor_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "recipient_actor_id" uuid NOT NULL, "type" text NOT NULL, "actor_id" uuid, "post_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "read_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_notifications_type" CHECK ("type" IN ('FOLLOW', 'LIKE', 'REPLY', 'MENTION', 'MODERATION')), CONSTRAINT "pk_notifications_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_notifications_actor_id_recipient_actor_id_type" ON "notifications"  ("recipient_actor_id", "type", "actor_id") WHERE "post_id" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_notifications_actor_id_post_id_recipient_actor_id_type" ON "notifications"  ("recipient_actor_id", "type", "actor_id", "post_id") WHERE "post_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_read_at_recipient_actor_id" ON "notifications"  ("recipient_actor_id", "read_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_created_at_id_recipient_actor_id" ON "notifications"  ("recipient_actor_id", "created_at", "id") `,
    );
    await queryRunner.query(`CREATE TABLE "reports" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "reporter_actor_id" uuid NOT NULL, "subject_type" text NOT NULL, "subject_actor_id" uuid, "subject_post_id" uuid, "reason" text NOT NULL, "details" text, "status" text NOT NULL DEFAULT 'OPEN', "moderator_note" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resolved_at" TIMESTAMP WITH TIME ZONE, "resolved_by_user_id" uuid, CONSTRAINT "chk_reports_subject_matches_type" CHECK (("subject_type" = 'ACTOR' AND "subject_actor_id" IS NOT NULL AND "subject_post_id" IS NULL)
   OR ("subject_type" = 'POST' AND "subject_post_id" IS NOT NULL AND "subject_actor_id" IS NULL)), CONSTRAINT "chk_reports_status" CHECK ("status" IN ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED')), CONSTRAINT "chk_reports_reason" CHECK ("reason" IN ('SPAM', 'HARASSMENT', 'HATE_SPEECH', 'ILLEGAL_CONTENT', 'IMPERSONATION', 'OTHER')), CONSTRAINT "chk_reports_subject_type" CHECK ("subject_type" IN ('ACTOR', 'POST')), CONSTRAINT "pk_reports_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(
      `CREATE INDEX "idx_reports_subject_post_id" ON "reports"  ("subject_post_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reports_subject_actor_id" ON "reports"  ("subject_actor_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reports_created_at_status" ON "reports"  ("status", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "bookmarks" ADD CONSTRAINT "fk_bookmarks_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookmarks" ADD CONSTRAINT "fk_bookmarks_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "likes" ADD CONSTRAINT "fk_likes_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "likes" ADD CONSTRAINT "fk_likes_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_recipient_actor_id" FOREIGN KEY ("recipient_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_reporter_actor_id" FOREIGN KEY ("reporter_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_subject_actor_id" FOREIGN KEY ("subject_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_subject_post_id" FOREIGN KEY ("subject_post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_resolved_by_user_id" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT "fk_reports_resolved_by_user_id"`,
    );
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "fk_reports_subject_post_id"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "fk_reports_subject_actor_id"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "fk_reports_reporter_actor_id"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "fk_notifications_post_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "fk_notifications_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "fk_notifications_recipient_actor_id"`,
    );
    await queryRunner.query(`ALTER TABLE "likes" DROP CONSTRAINT "fk_likes_post_id"`);
    await queryRunner.query(`ALTER TABLE "likes" DROP CONSTRAINT "fk_likes_actor_id"`);
    await queryRunner.query(`ALTER TABLE "bookmarks" DROP CONSTRAINT "fk_bookmarks_post_id"`);
    await queryRunner.query(`ALTER TABLE "bookmarks" DROP CONSTRAINT "fk_bookmarks_actor_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_reports_created_at_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_reports_subject_actor_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_reports_subject_post_id"`);
    await queryRunner.query(`DROP TABLE "reports"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_notifications_created_at_id_recipient_actor_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_notifications_read_at_recipient_actor_id"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_notifications_actor_id_post_id_recipient_actor_id_type"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_notifications_actor_id_recipient_actor_id_type"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP INDEX "public"."idx_likes_actor_id_created_at_post_id"`);
    await queryRunner.query(`DROP TABLE "likes"`);
    await queryRunner.query(`DROP INDEX "public"."idx_bookmarks_actor_id_created_at_post_id"`);
    await queryRunner.query(`DROP TABLE "bookmarks"`);
  }
}
