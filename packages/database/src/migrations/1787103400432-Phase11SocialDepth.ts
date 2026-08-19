import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Amendment B — social depth (`INITIAL_VISION.md` §188-190, P11-002): reposts, tags,
 * communities, direct messages, post edit history, pinned posts, and actor flair, plus
 * `posts.quoted_post_id`/`.quote_policy`/`.community_id`. Every timeline-shaped index is
 * `(…, created_at DESC, id DESC)`-keyset-shaped (§46); `community_invites` and
 * `message_requests` each get a partial unique index scoping "at most one pending" per pair
 * (§188, §189) — the same technique `credentials`/`notifications` already use for their own
 * partial uniqueness. `tags` deliberately has no `post_count` column (§181). Generated with
 * `pnpm db:generate`, reviewed, then formatted to match the rest of this package.
 */
export class Phase11SocialDepth1787103400432 implements MigrationInterface {
  name = 'Phase11SocialDepth1787103400432';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "actor_flair" ("actor_id" uuid NOT NULL, "document" jsonb NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_actor_flair_actor_id" PRIMARY KEY ("actor_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "communities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "display_name" text NOT NULL, "description" text NOT NULL DEFAULT '', "rules" text NOT NULL DEFAULT '', "created_by_actor_id" uuid NOT NULL, "is_public" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_communities_name" CHECK ("name" ~ '^[a-z0-9_]{3,32}$'), CONSTRAINT "pk_communities_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_communities_name" ON "communities"  ("name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "community_bans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "community_id" uuid NOT NULL, "actor_id" uuid NOT NULL, "reason" text, "banned_by_actor_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_community_bans_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_community_bans_actor_id_community_id_created_at" ON "community_bans"  ("community_id", "actor_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "community_invites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "community_id" uuid NOT NULL, "inviter_actor_id" uuid NOT NULL, "invitee_actor_id" uuid NOT NULL, "status" text NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_community_invites_status" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED')), CONSTRAINT "pk_community_invites_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_community_invites_created_at_id_invitee_actor_id" ON "community_invites"  ("invitee_actor_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_community_invites_community_id_invitee_actor_id" ON "community_invites"  ("community_id", "invitee_actor_id") WHERE "status" = 'PENDING'`,
    );
    await queryRunner.query(
      `CREATE TABLE "community_members" ("community_id" uuid NOT NULL, "actor_id" uuid NOT NULL, "role" text NOT NULL DEFAULT 'MEMBER', "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_community_members_role" CHECK ("role" IN ('MEMBER', 'MODERATOR')), CONSTRAINT "pk_community_members_actor_id_community_id" PRIMARY KEY ("community_id", "actor_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_community_members_actor_id_community_id_joined_at" ON "community_members"  ("community_id", "joined_at", "actor_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "kind" text NOT NULL DEFAULT 'DIRECT', "created_by_actor_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_message_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "chk_conversations_kind" CHECK ("kind" IN ('DIRECT', 'GROUP')), CONSTRAINT "pk_conversations_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "conversation_members" ("conversation_id" uuid NOT NULL, "actor_id" uuid NOT NULL, "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "left_at" TIMESTAMP WITH TIME ZONE, "last_read_message_id" uuid, "muted" boolean NOT NULL DEFAULT false, CONSTRAINT "pk_conversation_members_actor_id_conversation_id" PRIMARY KEY ("conversation_id", "actor_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "sender_actor_id" uuid, "body" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "pk_messages_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_messages_conversation_id_created_at_id" ON "messages"  ("conversation_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "message_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sender_actor_id" uuid NOT NULL, "recipient_actor_id" uuid NOT NULL, "body" text NOT NULL, "status" text NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_message_requests_status" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED')), CONSTRAINT "pk_message_requests_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_message_requests_created_at_id_recipient_actor_id" ON "message_requests"  ("recipient_actor_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_message_requests_recipient_actor_id_sender_actor_id" ON "message_requests"  ("sender_actor_id", "recipient_actor_id") WHERE "status" = 'PENDING'`,
    );
    await queryRunner.query(
      `CREATE TABLE "pinned_posts" ("actor_id" uuid NOT NULL, "post_id" uuid NOT NULL, "position" smallint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_pinned_posts_position" CHECK ("position" BETWEEN 0 AND 2), CONSTRAINT "pk_pinned_posts_actor_id_post_id" PRIMARY KEY ("actor_id", "post_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "post_edits" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "post_id" uuid NOT NULL, "previous_body" text, "previous_content_warning" text, "previous_media_manifest" jsonb, "edited_by_actor_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_post_edits_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_post_edits_created_at_id_post_id" ON "post_edits"  ("post_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "display_name" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_tags_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_tags_name" ON "tags"  ("name") `);
    await queryRunner.query(
      `CREATE TABLE "post_tags" ("post_id" uuid NOT NULL, "tag_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_post_tags_post_id_tag_id" PRIMARY KEY ("post_id", "tag_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_post_tags_created_at_post_id_tag_id" ON "post_tags"  ("tag_id", "created_at", "post_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "reposts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid NOT NULL, "post_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_reposts_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reposts_created_at_id_post_id" ON "reposts"  ("post_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reposts_actor_id_created_at_id" ON "reposts"  ("actor_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_reposts_actor_id_post_id" ON "reposts"  ("actor_id", "post_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tag_mutes" ("actor_id" uuid NOT NULL, "tag_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_tag_mutes_actor_id_tag_id" PRIMARY KEY ("actor_id", "tag_id"))`,
    );
    await queryRunner.query(`ALTER TABLE "posts" ADD "quoted_post_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "posts" ADD "quote_policy" text NOT NULL DEFAULT 'ANYONE'`,
    );
    await queryRunner.query(`ALTER TABLE "posts" ADD "community_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "idx_posts_community_id_created_at_id" ON "posts"  ("community_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD CONSTRAINT "chk_posts_quote_policy" CHECK ("quote_policy" IN ('ANYONE', 'FOLLOWERS', 'NOBODY'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "actor_flair" ADD CONSTRAINT "fk_actor_flair_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "communities" ADD CONSTRAINT "fk_communities_created_by_actor_id" FOREIGN KEY ("created_by_actor_id") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD CONSTRAINT "fk_posts_quoted_post_id" FOREIGN KEY ("quoted_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD CONSTRAINT "fk_posts_community_id" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_bans" ADD CONSTRAINT "fk_community_bans_community_id" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_bans" ADD CONSTRAINT "fk_community_bans_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_bans" ADD CONSTRAINT "fk_community_bans_banned_by_actor_id" FOREIGN KEY ("banned_by_actor_id") REFERENCES "actors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_invites" ADD CONSTRAINT "fk_community_invites_community_id" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_invites" ADD CONSTRAINT "fk_community_invites_inviter_actor_id" FOREIGN KEY ("inviter_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_invites" ADD CONSTRAINT "fk_community_invites_invitee_actor_id" FOREIGN KEY ("invitee_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_members" ADD CONSTRAINT "fk_community_members_community_id" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_members" ADD CONSTRAINT "fk_community_members_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "fk_conversations_created_by_actor_id" FOREIGN KEY ("created_by_actor_id") REFERENCES "actors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_members" ADD CONSTRAINT "fk_conversation_members_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_members" ADD CONSTRAINT "fk_conversation_members_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_sender_actor_id" FOREIGN KEY ("sender_actor_id") REFERENCES "actors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_requests" ADD CONSTRAINT "fk_message_requests_sender_actor_id" FOREIGN KEY ("sender_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_requests" ADD CONSTRAINT "fk_message_requests_recipient_actor_id" FOREIGN KEY ("recipient_actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pinned_posts" ADD CONSTRAINT "fk_pinned_posts_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pinned_posts" ADD CONSTRAINT "fk_pinned_posts_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "post_edits" ADD CONSTRAINT "fk_post_edits_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "post_edits" ADD CONSTRAINT "fk_post_edits_edited_by_actor_id" FOREIGN KEY ("edited_by_actor_id") REFERENCES "actors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "post_tags" ADD CONSTRAINT "fk_post_tags_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "post_tags" ADD CONSTRAINT "fk_post_tags_tag_id" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reposts" ADD CONSTRAINT "fk_reposts_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reposts" ADD CONSTRAINT "fk_reposts_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tag_mutes" ADD CONSTRAINT "fk_tag_mutes_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tag_mutes" ADD CONSTRAINT "fk_tag_mutes_tag_id" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tag_mutes" DROP CONSTRAINT "fk_tag_mutes_tag_id"`);
    await queryRunner.query(`ALTER TABLE "tag_mutes" DROP CONSTRAINT "fk_tag_mutes_actor_id"`);
    await queryRunner.query(`ALTER TABLE "reposts" DROP CONSTRAINT "fk_reposts_post_id"`);
    await queryRunner.query(`ALTER TABLE "reposts" DROP CONSTRAINT "fk_reposts_actor_id"`);
    await queryRunner.query(`ALTER TABLE "post_tags" DROP CONSTRAINT "fk_post_tags_tag_id"`);
    await queryRunner.query(`ALTER TABLE "post_tags" DROP CONSTRAINT "fk_post_tags_post_id"`);
    await queryRunner.query(
      `ALTER TABLE "post_edits" DROP CONSTRAINT "fk_post_edits_edited_by_actor_id"`,
    );
    await queryRunner.query(`ALTER TABLE "post_edits" DROP CONSTRAINT "fk_post_edits_post_id"`);
    await queryRunner.query(`ALTER TABLE "pinned_posts" DROP CONSTRAINT "fk_pinned_posts_post_id"`);
    await queryRunner.query(
      `ALTER TABLE "pinned_posts" DROP CONSTRAINT "fk_pinned_posts_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_requests" DROP CONSTRAINT "fk_message_requests_recipient_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_requests" DROP CONSTRAINT "fk_message_requests_sender_actor_id"`,
    );
    await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "fk_messages_sender_actor_id"`);
    await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "fk_messages_conversation_id"`);
    await queryRunner.query(
      `ALTER TABLE "conversation_members" DROP CONSTRAINT "fk_conversation_members_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_members" DROP CONSTRAINT "fk_conversation_members_conversation_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT "fk_conversations_created_by_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_members" DROP CONSTRAINT "fk_community_members_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_members" DROP CONSTRAINT "fk_community_members_community_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_invites" DROP CONSTRAINT "fk_community_invites_invitee_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_invites" DROP CONSTRAINT "fk_community_invites_inviter_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_invites" DROP CONSTRAINT "fk_community_invites_community_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_bans" DROP CONSTRAINT "fk_community_bans_banned_by_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_bans" DROP CONSTRAINT "fk_community_bans_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "community_bans" DROP CONSTRAINT "fk_community_bans_community_id"`,
    );
    await queryRunner.query(`ALTER TABLE "posts" DROP CONSTRAINT "fk_posts_community_id"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP CONSTRAINT "fk_posts_quoted_post_id"`);
    await queryRunner.query(
      `ALTER TABLE "communities" DROP CONSTRAINT "fk_communities_created_by_actor_id"`,
    );
    await queryRunner.query(`ALTER TABLE "actor_flair" DROP CONSTRAINT "fk_actor_flair_actor_id"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP CONSTRAINT "chk_posts_quote_policy"`);
    await queryRunner.query(`DROP INDEX "public"."idx_posts_community_id_created_at_id"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "community_id"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "quote_policy"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "quoted_post_id"`);
    await queryRunner.query(`DROP TABLE "tag_mutes"`);
    await queryRunner.query(`DROP INDEX "public"."idx_reposts_actor_id_post_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_reposts_actor_id_created_at_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_reposts_created_at_id_post_id"`);
    await queryRunner.query(`DROP TABLE "reposts"`);
    await queryRunner.query(`DROP INDEX "public"."idx_post_tags_created_at_post_id_tag_id"`);
    await queryRunner.query(`DROP TABLE "post_tags"`);
    await queryRunner.query(`DROP INDEX "public"."idx_tags_name"`);
    await queryRunner.query(`DROP TABLE "tags"`);
    await queryRunner.query(`DROP INDEX "public"."idx_post_edits_created_at_id_post_id"`);
    await queryRunner.query(`DROP TABLE "post_edits"`);
    await queryRunner.query(`DROP TABLE "pinned_posts"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_message_requests_recipient_actor_id_sender_actor_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_message_requests_created_at_id_recipient_actor_id"`,
    );
    await queryRunner.query(`DROP TABLE "message_requests"`);
    await queryRunner.query(`DROP INDEX "public"."idx_messages_conversation_id_created_at_id"`);
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP TABLE "conversation_members"`);
    await queryRunner.query(`DROP TABLE "conversations"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_community_members_actor_id_community_id_joined_at"`,
    );
    await queryRunner.query(`DROP TABLE "community_members"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_community_invites_community_id_invitee_actor_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_community_invites_created_at_id_invitee_actor_id"`,
    );
    await queryRunner.query(`DROP TABLE "community_invites"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_community_bans_actor_id_community_id_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "community_bans"`);
    await queryRunner.query(`DROP INDEX "public"."idx_communities_name"`);
    await queryRunner.query(`DROP TABLE "communities"`);
    await queryRunner.query(`DROP TABLE "actor_flair"`);
  }
}
