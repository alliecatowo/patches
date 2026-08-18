import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3 social graph: `follows`, `blocks`, `mutes`, plus `posts.content_warning` (B-018).
 * Generated with `pnpm db:generate` from the entities, then reviewed and hand-edited
 * (`INITIAL_VISION.md` §16.2) in exactly two ways, both following `Phase1Schema`'s precedent:
 *
 * 1. `uuid_generate_v4()` -> `gen_random_uuid()` on `follows.id` (see `Phase1Schema`'s own
 *    comment for why — no `uuid-ossp` extension is ever installed).
 * 2. Import style/formatting, to satisfy lint and prettier.
 *
 * `blocks`/`mutes` have no owning RPC yet (`BlockActor`/`MuteActor` land in Phase 6, spec
 * §140) — the tables exist now purely so `FeedService`'s block/mute-aware SQL (§59) and
 * `SocialGraphService.GetRelationship` have something to join against.
 *
 * Nothing else was changed: `pnpm db:generate --name=Probe` against a migrated database
 * reports no further changes.
 */
export class Phase3SocialGraph1787055340075 implements MigrationInterface {
  name = 'Phase3SocialGraph1787055340075';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "blocks" ("blocker_actor_id" uuid NOT NULL, "blocked_actor_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_blocks_no_self_block" CHECK ("blocker_actor_id" <> "blocked_actor_id"), CONSTRAINT "pk_blocks_blocked_actor_id_blocker_actor_id" PRIMARY KEY ("blocker_actor_id", "blocked_actor_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "follows" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "follower_actor_id" uuid NOT NULL, "followee_actor_id" uuid NOT NULL, "status" text NOT NULL DEFAULT 'FOLLOWING', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "accepted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_follows_no_self_follow" CHECK ("follower_actor_id" <> "followee_actor_id"), CONSTRAINT "chk_follows_status" CHECK ("status" IN ('PENDING', 'FOLLOWING')), CONSTRAINT "pk_follows_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_follows_created_at_followee_actor_id_id" ON "follows"  ("followee_actor_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_follows_created_at_follower_actor_id_id" ON "follows"  ("follower_actor_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_follows_followee_actor_id_follower_actor_id" ON "follows"  ("follower_actor_id", "followee_actor_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "mutes" ("muter_actor_id" uuid NOT NULL, "muted_actor_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_mutes_no_self_mute" CHECK ("muter_actor_id" <> "muted_actor_id"), CONSTRAINT "pk_mutes_muted_actor_id_muter_actor_id" PRIMARY KEY ("muter_actor_id", "muted_actor_id"))`,
    );
    await queryRunner.query(`ALTER TABLE "posts" ADD "content_warning" text`);
    await queryRunner.query(
      `ALTER TABLE "blocks" ADD CONSTRAINT "fk_blocks_blocker_actor_id" FOREIGN KEY ("blocker_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "blocks" ADD CONSTRAINT "fk_blocks_blocked_actor_id" FOREIGN KEY ("blocked_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "follows" ADD CONSTRAINT "fk_follows_follower_actor_id" FOREIGN KEY ("follower_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "follows" ADD CONSTRAINT "fk_follows_followee_actor_id" FOREIGN KEY ("followee_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mutes" ADD CONSTRAINT "fk_mutes_muter_actor_id" FOREIGN KEY ("muter_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mutes" ADD CONSTRAINT "fk_mutes_muted_actor_id" FOREIGN KEY ("muted_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mutes" DROP CONSTRAINT "fk_mutes_muted_actor_id"`);
    await queryRunner.query(`ALTER TABLE "mutes" DROP CONSTRAINT "fk_mutes_muter_actor_id"`);
    await queryRunner.query(`ALTER TABLE "follows" DROP CONSTRAINT "fk_follows_followee_actor_id"`);
    await queryRunner.query(`ALTER TABLE "follows" DROP CONSTRAINT "fk_follows_follower_actor_id"`);
    await queryRunner.query(`ALTER TABLE "blocks" DROP CONSTRAINT "fk_blocks_blocked_actor_id"`);
    await queryRunner.query(`ALTER TABLE "blocks" DROP CONSTRAINT "fk_blocks_blocker_actor_id"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "content_warning"`);
    await queryRunner.query(`DROP TABLE "mutes"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_follows_followee_actor_id_follower_actor_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_follows_created_at_follower_actor_id_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_follows_created_at_followee_actor_id_id"`);
    await queryRunner.query(`DROP TABLE "follows"`);
    await queryRunner.query(`DROP TABLE "blocks"`);
  }
}
