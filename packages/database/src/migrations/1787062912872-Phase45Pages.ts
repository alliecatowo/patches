import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4.5 Patches Pages (`INITIAL_VISION.md` §170-172): `pages`, `page_revisions`,
 * `page_assets`, `guestbook_entries`, plus a `reports.subject_guestbook_entry_id` column so
 * `PageService.ReportGuestbookEntry` can reuse the existing `reports` table (P45-003).
 * Generated with `pnpm db:generate` from the entities, then reviewed and hand-edited in
 * three ways, following `Phase4Interactions`'s precedent:
 *
 * 1. `uuid_generate_v4()` -> `gen_random_uuid()` on every new table's `id` — no `uuid-ossp`
 *    extension is ever installed (same reasoning as `Phase1Schema`).
 * 2. `reports.chk_reports_subject_type`/`chk_reports_subject_matches_type` are **hand-added**
 *    `DROP CONSTRAINT` + `ADD CONSTRAINT` pairs: TypeORM's migration:generate diffs a named
 *    `@Check`'s *presence*, not its SQL text, so changing an existing check's expression
 *    (`report.entity.ts`'s `GUESTBOOK_ENTRY` addition) is silently dropped by the generator
 *    and has to be added by hand — otherwise the two checks would keep enforcing the
 *    pre-Phase-4.5 two-subject-type rule forever, in spite of what the entity says.
 * 3. Import style/formatting, to satisfy lint and prettier.
 *
 * Nothing else was changed: `pnpm db:generate --name=Probe` against a migrated database
 * reports no further changes.
 */
export class Phase45Pages1787062912872 implements MigrationInterface {
  name = 'Phase45Pages1787062912872';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "page_revisions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "page_id" uuid NOT NULL, "revision_number" integer NOT NULL, "document" jsonb NOT NULL, "byte_size" integer NOT NULL, "created_by_actor_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_page_revisions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_page_revisions_page_id_revision_number" ON "page_revisions"  ("page_id", "revision_number") `,
    );
    await queryRunner.query(
      `CREATE TABLE "pages" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "actor_id" uuid NOT NULL, "current_revision_id" uuid, "visibility" text NOT NULL DEFAULT 'PUBLIC', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_pages_visibility" CHECK ("visibility" IN ('PUBLIC', 'UNLISTED')), CONSTRAINT "pk_pages_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_pages_actor_id" ON "pages"  ("actor_id") `);
    await queryRunner.query(
      `CREATE TABLE "guestbook_entries" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "page_id" uuid NOT NULL, "author_actor_id" uuid, "body" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "removed_at" TIMESTAMP WITH TIME ZONE, "removed_by_actor_id" uuid, CONSTRAINT "pk_guestbook_entries_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_guestbook_entries_created_at_page_id" ON "guestbook_entries"  ("page_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "page_assets" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "page_id" uuid NOT NULL, "media_id" uuid NOT NULL, "byte_size" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_page_assets_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_page_assets_media_id_page_id" ON "page_assets"  ("page_id", "media_id") `,
    );
    await queryRunner.query(`ALTER TABLE "reports" ADD "subject_guestbook_entry_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "idx_reports_subject_guestbook_entry_id" ON "reports"  ("subject_guestbook_entry_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "page_revisions" ADD CONSTRAINT "fk_page_revisions_page_id" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "page_revisions" ADD CONSTRAINT "fk_page_revisions_created_by_actor_id" FOREIGN KEY ("created_by_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pages" ADD CONSTRAINT "fk_pages_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pages" ADD CONSTRAINT "fk_pages_current_revision_id" FOREIGN KEY ("current_revision_id") REFERENCES "page_revisions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "guestbook_entries" ADD CONSTRAINT "fk_guestbook_entries_page_id" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "guestbook_entries" ADD CONSTRAINT "fk_guestbook_entries_author_actor_id" FOREIGN KEY ("author_actor_id") REFERENCES "actors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "guestbook_entries" ADD CONSTRAINT "fk_guestbook_entries_removed_by_actor_id" FOREIGN KEY ("removed_by_actor_id") REFERENCES "actors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "page_assets" ADD CONSTRAINT "fk_page_assets_page_id" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "page_assets" ADD CONSTRAINT "fk_page_assets_media_id" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_subject_guestbook_entry_id" FOREIGN KEY ("subject_guestbook_entry_id") REFERENCES "guestbook_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Hand-added (see the class doc comment): widen the two `reports` checks that changed
    // shape in `report.entity.ts` but that migration:generate didn't pick up.
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_type"`);
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_type" CHECK ("subject_type" IN ('ACTOR', 'POST', 'GUESTBOOK_ENTRY'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_matches_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_matches_type" CHECK (("subject_type" = 'ACTOR' AND "subject_actor_id" IS NOT NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL)
   OR ("subject_type" = 'POST' AND "subject_post_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_guestbook_entry_id" IS NULL)
   OR ("subject_type" = 'GUESTBOOK_ENTRY' AND "subject_guestbook_entry_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_matches_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_matches_type" CHECK (("subject_type" = 'ACTOR' AND "subject_actor_id" IS NOT NULL AND "subject_post_id" IS NULL)
   OR ("subject_type" = 'POST' AND "subject_post_id" IS NOT NULL AND "subject_actor_id" IS NULL))`,
    );
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "chk_reports_subject_type"`);
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "chk_reports_subject_type" CHECK ("subject_type" IN ('ACTOR', 'POST'))`,
    );

    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT "fk_reports_subject_guestbook_entry_id"`,
    );
    await queryRunner.query(`ALTER TABLE "page_assets" DROP CONSTRAINT "fk_page_assets_media_id"`);
    await queryRunner.query(`ALTER TABLE "page_assets" DROP CONSTRAINT "fk_page_assets_page_id"`);
    await queryRunner.query(
      `ALTER TABLE "guestbook_entries" DROP CONSTRAINT "fk_guestbook_entries_removed_by_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "guestbook_entries" DROP CONSTRAINT "fk_guestbook_entries_author_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "guestbook_entries" DROP CONSTRAINT "fk_guestbook_entries_page_id"`,
    );
    await queryRunner.query(`ALTER TABLE "pages" DROP CONSTRAINT "fk_pages_current_revision_id"`);
    await queryRunner.query(`ALTER TABLE "pages" DROP CONSTRAINT "fk_pages_actor_id"`);
    await queryRunner.query(
      `ALTER TABLE "page_revisions" DROP CONSTRAINT "fk_page_revisions_created_by_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "page_revisions" DROP CONSTRAINT "fk_page_revisions_page_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_reports_subject_guestbook_entry_id"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "subject_guestbook_entry_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_page_assets_media_id_page_id"`);
    await queryRunner.query(`DROP TABLE "page_assets"`);
    await queryRunner.query(`DROP INDEX "public"."idx_guestbook_entries_created_at_page_id"`);
    await queryRunner.query(`DROP TABLE "guestbook_entries"`);
    await queryRunner.query(`DROP INDEX "public"."idx_pages_actor_id"`);
    await queryRunner.query(`DROP TABLE "pages"`);
    await queryRunner.query(`DROP INDEX "public"."idx_page_revisions_page_id_revision_number"`);
    await queryRunner.query(`DROP TABLE "page_revisions"`);
  }
}
