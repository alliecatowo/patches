import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `follow_requests` (`INITIAL_VISION.md` §197.5, P14-010's follow-up) — see
 * `follow-request.entity.ts` for why this is its own table rather than reusing
 * `follows.status = 'PENDING'`.
 *
 * Also widens `chk_notifications_type` to add `'FOLLOW_REQUEST'` — `migration:generate` does
 * not diff an existing `@Check()` body on an unchanged table/column (see
 * `1787104500000-Phase11ReactionNotifyTypes.ts`'s own doc comment for the same caveat), so
 * this is hand-added rather than generated.
 */
export class Phase14FollowRequests1787153689257 implements MigrationInterface {
  name = 'Phase14FollowRequests1787153689257';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "follow_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "requester_actor_id" uuid NOT NULL, "target_actor_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_follow_requests_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_follow_requests_created_at_id_target_actor_id" ON "follow_requests"  ("target_actor_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_follow_requests_requester_actor_id_target_actor_id" ON "follow_requests"  ("requester_actor_id", "target_actor_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "follow_requests" ADD CONSTRAINT "fk_follow_requests_requester_actor_id" FOREIGN KEY ("requester_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "follow_requests" ADD CONSTRAINT "fk_follow_requests_target_actor_id" FOREIGN KEY ("target_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "chk_notifications_type"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "chk_notifications_type" CHECK ("type" IN ('FOLLOW', 'LIKE', 'REPLY', 'MENTION', 'MODERATION', 'MESSAGE', 'REPOST', 'QUOTE', 'COMMUNITY_INVITE', 'FOLLOW_REQUEST'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "chk_notifications_type"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "chk_notifications_type" CHECK ("type" IN ('FOLLOW', 'LIKE', 'REPLY', 'MENTION', 'MODERATION', 'MESSAGE', 'REPOST', 'QUOTE', 'COMMUNITY_INVITE'))`,
    );

    await queryRunner.query(
      `ALTER TABLE "follow_requests" DROP CONSTRAINT "fk_follow_requests_target_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "follow_requests" DROP CONSTRAINT "fk_follow_requests_requester_actor_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_follow_requests_requester_actor_id_target_actor_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_follow_requests_created_at_id_target_actor_id"`,
    );
    await queryRunner.query(`DROP TABLE "follow_requests"`);
  }
}
