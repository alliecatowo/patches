import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 + Phase 2 schema: identity (`users`, `actors`, `credentials`,
 * `ssh_login_challenges`, `auth_codes`, `refresh_tokens`, `invites`), the durable job queue
 * (`outbox_jobs`), and posting (`posts`, `media`, `post_media`). Generated with
 * `pnpm db:generate` from the entities, then reviewed and hand-edited
 * (`INITIAL_VISION.md` §16.2) in exactly three ways:
 *
 * 1. `uuid_generate_v4()` -> `gen_random_uuid()`. TypeORM's default emits the former, which
 *    requires the `uuid-ossp` extension; `gen_random_uuid()` is built into PostgreSQL 13+, so
 *    this schema installs no extensions at all. The driver recognizes both as the "uuid"
 *    generation strategy, so `migration:generate` still reports no drift.
 * 2. `DESC` added to the two feed indexes §60 specifies with a direction
 *    (`posts(author_actor_id, created_at DESC, id DESC)`, `posts(created_at DESC, id DESC)`).
 *    TypeORM's `@Index` cannot express per-column direction, and it matters for the first
 *    one: PostgreSQL can scan an all-ASC index backwards, but not one where only some
 *    columns are reversed — which is exactly the keyset order the author feed pages by (§46).
 * 3. Import style/formatting, to satisfy lint and prettier.
 *
 * Nothing else was changed: `pnpm db:generate --name=Probe` against a migrated database
 * reports no further changes.
 */
export class Phase1Schema1787036506325 implements MigrationInterface {
  name = 'Phase1Schema1787036506325';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "media" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "owner_actor_id" uuid NOT NULL, "state" text NOT NULL DEFAULT 'PENDING_UPLOAD', "source_object_key" text, "display_object_key" text, "thumbnail_object_key" text, "mime_type" text, "width" integer, "height" integer, "byte_size" bigint, "alt_text" text, "content_hash" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "processed_at" TIMESTAMP WITH TIME ZONE, "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_media_state" CHECK ("state" IN ('PENDING_UPLOAD', 'PROCESSING', 'READY', 'FAILED', 'DELETED')), CONSTRAINT "pk_media_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_media_created_at_owner_actor_id" ON "media"  ("owner_actor_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "recovery_email" text, "recovery_email_normalized" text, "email_verified_at" TIMESTAMP WITH TIME ZONE, "status" text NOT NULL DEFAULT 'ACTIVE', "actor_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_users_actor_id" UNIQUE ("actor_id"), CONSTRAINT "chk_users_status" CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'DELETED')), CONSTRAINT "pk_users_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_recovery_email_normalized" ON "users"  ("recovery_email_normalized") `,
    );
    await queryRunner.query(
      `CREATE TABLE "actors" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid, "handle" text NOT NULL, "handle_normalized" text NOT NULL, "display_name" text, "bio" text, "location_text" text, "website_url" text, "avatar_media_id" uuid, "is_local" boolean NOT NULL DEFAULT true, "home_server" text, "canonical_uri" text, "inbox_uri" text, "outbox_uri" text, "federation_state" text, "moved_to_uri" text, "also_known_as" jsonb, "nameplate" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_actors_user_id" UNIQUE ("user_id"), CONSTRAINT "pk_actors_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_actors_canonical_uri" ON "actors"  ("canonical_uri") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_actors_handle_normalized" ON "actors"  ("handle_normalized") `,
    );
    await queryRunner.query(
      `CREATE TABLE "auth_codes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "purpose" text NOT NULL, "code_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "consumed_at" TIMESTAMP WITH TIME ZONE, "attempts" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_auth_codes_purpose" CHECK ("purpose" IN ('VERIFY_EMAIL', 'RESET_PASSWORD')), CONSTRAINT "pk_auth_codes_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_auth_codes_code_hash" ON "auth_codes"  ("code_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_auth_codes_created_at_purpose_user_id" ON "auth_codes"  ("user_id", "purpose", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "credentials" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "type" text NOT NULL, "identifier" text, "secret_hash" text, "public_material" text, "metadata" jsonb, "label" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_used_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_credentials_type" CHECK ("type" IN ('PASSWORD', 'SSH_PUBLIC_KEY', 'GITHUB', 'PASSKEY')), CONSTRAINT "pk_credentials_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_credentials_user_id" ON "credentials"  ("user_id") WHERE type = 'PASSWORD' AND revoked_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_credentials_identifier_type" ON "credentials"  ("type", "identifier") WHERE revoked_at IS NULL AND identifier IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_credentials_type_user_id" ON "credentials"  ("user_id", "type") `,
    );
    await queryRunner.query(
      `CREATE TABLE "invites" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "code_hash" text NOT NULL, "created_by_user_id" uuid NOT NULL, "max_uses" integer NOT NULL DEFAULT '1', "uses" integer NOT NULL DEFAULT '0', "expires_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "note" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_invites_uses_within_max" CHECK ("uses" >= 0 AND "max_uses" >= 1 AND "uses" <= "max_uses"), CONSTRAINT "pk_invites_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_invites_created_at_created_by_user_id" ON "invites"  ("created_by_user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_invites_code_hash" ON "invites"  ("code_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "outbox_jobs" ("id" BIGSERIAL NOT NULL, "type" text NOT NULL, "payload" jsonb NOT NULL, "status" text NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT '0', "max_attempts" integer NOT NULL DEFAULT '10', "available_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "locked_at" TIMESTAMP WITH TIME ZONE, "locked_by" text, "last_error" text, "idempotency_key" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_outbox_jobs_attempts" CHECK ("attempts" >= 0 AND "max_attempts" >= 1), CONSTRAINT "chk_outbox_jobs_status" CHECK ("status" IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD')), CONSTRAINT "pk_outbox_jobs_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_outbox_jobs_idempotency_key" ON "outbox_jobs"  ("idempotency_key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_outbox_jobs_available_at_id_status" ON "outbox_jobs"  ("status", "available_at", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "posts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "author_actor_id" uuid NOT NULL, "body" text, "post_type" text NOT NULL DEFAULT 'NOTE', "link_url" text, "visibility" text NOT NULL DEFAULT 'PUBLIC', "in_reply_to_id" uuid, "root_post_id" uuid NOT NULL, "canonical_uri" text, "origin_server" text, "is_local" boolean NOT NULL DEFAULT true, "client_request_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "edited_at" TIMESTAMP WITH TIME ZONE, "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_posts_link_url_required_for_link" CHECK ("post_type" <> 'LINK' OR "link_url" IS NOT NULL), CONSTRAINT "chk_posts_visibility" CHECK ("visibility" IN ('PUBLIC', 'UNLISTED', 'FOLLOWERS')), CONSTRAINT "chk_posts_post_type" CHECK ("post_type" IN ('NOTE', 'LINK')), CONSTRAINT "pk_posts_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_posts_author_actor_id_client_request_id" ON "posts"  ("author_actor_id", "client_request_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_posts_canonical_uri" ON "posts"  ("canonical_uri") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_posts_created_at_id_in_reply_to_id" ON "posts"  ("in_reply_to_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_posts_created_at_id_root_post_id" ON "posts"  ("root_post_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_posts_created_at_id" ON "posts"  ("created_at" DESC, "id" DESC) `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_posts_author_actor_id_created_at_id" ON "posts"  ("author_actor_id", "created_at" DESC, "id" DESC) `,
    );
    await queryRunner.query(
      `CREATE TABLE "post_media" ("post_id" uuid NOT NULL, "media_id" uuid NOT NULL, "position" integer NOT NULL, CONSTRAINT "chk_post_media_position" CHECK ("position" >= 0 AND "position" < 4), CONSTRAINT "pk_post_media_media_id_post_id" PRIMARY KEY ("post_id", "media_id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_post_media_position_post_id" ON "post_media"  ("post_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ssh_login_challenges" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "nonce" bytea NOT NULL, "claimed_handle" text, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "consumed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_ssh_login_challenges_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ssh_login_challenges_expires_at" ON "ssh_login_challenges"  ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "session_id" uuid NOT NULL, "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_agent" text, CONSTRAINT "pk_refresh_tokens_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_session_id" ON "refresh_tokens"  ("session_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_created_at_user_id" ON "refresh_tokens"  ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_refresh_tokens_token_hash" ON "refresh_tokens"  ("token_hash") `,
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD CONSTRAINT "fk_media_owner_actor_id" FOREIGN KEY ("owner_actor_id") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "fk_users_actor_id" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "actors" ADD CONSTRAINT "fk_actors_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "actors" ADD CONSTRAINT "fk_actors_avatar_media_id" FOREIGN KEY ("avatar_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_codes" ADD CONSTRAINT "fk_auth_codes_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" ADD CONSTRAINT "fk_credentials_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invites" ADD CONSTRAINT "fk_invites_created_by_user_id" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD CONSTRAINT "fk_posts_author_actor_id" FOREIGN KEY ("author_actor_id") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD CONSTRAINT "fk_posts_in_reply_to_id" FOREIGN KEY ("in_reply_to_id") REFERENCES "posts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD CONSTRAINT "fk_posts_root_post_id" FOREIGN KEY ("root_post_id") REFERENCES "posts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "post_media" ADD CONSTRAINT "fk_post_media_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "post_media" ADD CONSTRAINT "fk_post_media_media_id" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "fk_refresh_tokens_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "fk_refresh_tokens_user_id"`,
    );
    await queryRunner.query(`ALTER TABLE "post_media" DROP CONSTRAINT "fk_post_media_media_id"`);
    await queryRunner.query(`ALTER TABLE "post_media" DROP CONSTRAINT "fk_post_media_post_id"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP CONSTRAINT "fk_posts_root_post_id"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP CONSTRAINT "fk_posts_in_reply_to_id"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP CONSTRAINT "fk_posts_author_actor_id"`);
    await queryRunner.query(
      `ALTER TABLE "invites" DROP CONSTRAINT "fk_invites_created_by_user_id"`,
    );
    await queryRunner.query(`ALTER TABLE "credentials" DROP CONSTRAINT "fk_credentials_user_id"`);
    await queryRunner.query(`ALTER TABLE "auth_codes" DROP CONSTRAINT "fk_auth_codes_user_id"`);
    await queryRunner.query(`ALTER TABLE "actors" DROP CONSTRAINT "fk_actors_avatar_media_id"`);
    await queryRunner.query(`ALTER TABLE "actors" DROP CONSTRAINT "fk_actors_user_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "fk_users_actor_id"`);
    await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT "fk_media_owner_actor_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_token_hash"`);
    await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_created_at_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_session_id"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."idx_ssh_login_challenges_expires_at"`);
    await queryRunner.query(`DROP TABLE "ssh_login_challenges"`);
    await queryRunner.query(`DROP INDEX "public"."idx_post_media_position_post_id"`);
    await queryRunner.query(`DROP TABLE "post_media"`);
    await queryRunner.query(`DROP INDEX "public"."idx_posts_author_actor_id_created_at_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_posts_created_at_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_posts_created_at_id_root_post_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_posts_created_at_id_in_reply_to_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_posts_canonical_uri"`);
    await queryRunner.query(`DROP INDEX "public"."idx_posts_author_actor_id_client_request_id"`);
    await queryRunner.query(`DROP TABLE "posts"`);
    await queryRunner.query(`DROP INDEX "public"."idx_outbox_jobs_available_at_id_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_outbox_jobs_idempotency_key"`);
    await queryRunner.query(`DROP TABLE "outbox_jobs"`);
    await queryRunner.query(`DROP INDEX "public"."idx_invites_code_hash"`);
    await queryRunner.query(`DROP INDEX "public"."idx_invites_created_at_created_by_user_id"`);
    await queryRunner.query(`DROP TABLE "invites"`);
    await queryRunner.query(`DROP INDEX "public"."idx_credentials_type_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_credentials_identifier_type"`);
    await queryRunner.query(`DROP INDEX "public"."idx_credentials_user_id"`);
    await queryRunner.query(`DROP TABLE "credentials"`);
    await queryRunner.query(`DROP INDEX "public"."idx_auth_codes_created_at_purpose_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_auth_codes_code_hash"`);
    await queryRunner.query(`DROP TABLE "auth_codes"`);
    await queryRunner.query(`DROP INDEX "public"."idx_actors_handle_normalized"`);
    await queryRunner.query(`DROP INDEX "public"."idx_actors_canonical_uri"`);
    await queryRunner.query(`DROP TABLE "actors"`);
    await queryRunner.query(`DROP INDEX "public"."idx_users_recovery_email_normalized"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP INDEX "public"."idx_media_created_at_owner_actor_id"`);
    await queryRunner.query(`DROP TABLE "media"`);
  }
}
