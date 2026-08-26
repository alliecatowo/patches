# Patches expected database schema — Atlas HCL snapshot. Do not edit by hand.
# Regenerate with: node infra/scripts/schema-drift.mjs --regenerate
# (against a fully migrated, throwaway Postgres 17 — same major as CI/compose, never production).
# Produced by `atlas community v1.3.1 schema inspect`, pinned in .github/workflows/schema-drift.yml.
# What this gate catches and why it exists: docs/operations/schema-drift.md

table "account_deletion_requests" {
  schema = schema.public
  column "actor_id" {
    null = false
    type = uuid
  }
  column "requested_at" {
    null = false
    type = timestamptz
  }
  column "purge_after" {
    null = false
    type = timestamptz
  }
  column "cancelled_at" {
    null = true
    type = timestamptz
  }
  column "purged_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.actor_id]
  }
  foreign_key "fk_account_deletion_requests_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
}
table "account_exports" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "status" {
    null    = false
    type    = text
    default = "PENDING"
  }
  column "requested_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "ready_at" {
    null = true
    type = timestamptz
  }
  column "object_key" {
    null = true
    type = text
  }
  column "expires_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_account_exports_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_account_exports_actor_id_requested_at" {
    columns = [column.actor_id, column.requested_at]
  }
  check "chk_account_exports_status" {
    expr = "(status = ANY (ARRAY['PENDING'::text, 'READY'::text, 'FAILED'::text, 'EXPIRED'::text]))"
  }
}
table "actor_flair" {
  schema = schema.public
  column "actor_id" {
    null = false
    type = uuid
  }
  column "document" {
    null = false
    type = jsonb
  }
  column "updated_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.actor_id]
  }
  foreign_key "fk_actor_flair_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
}
table "actor_privacy_prefs" {
  schema = schema.public
  column "actor_id" {
    null = false
    type = uuid
  }
  column "discoverable" {
    null    = false
    type    = boolean
    default = true
  }
  column "indexable" {
    null    = false
    type    = boolean
    default = true
  }
  column "show_in_local_feed" {
    null    = false
    type    = boolean
    default = true
  }
  column "locked" {
    null    = false
    type    = boolean
    default = false
  }
  column "privacy_notice_version" {
    null = true
    type = integer
  }
  column "privacy_notice_acknowledged_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.actor_id]
  }
  foreign_key "fk_actor_privacy_prefs_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
}
table "actors" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "user_id" {
    null = true
    type = uuid
  }
  column "handle" {
    null = false
    type = text
  }
  column "handle_normalized" {
    null = false
    type = text
  }
  column "display_name" {
    null = true
    type = text
  }
  column "bio" {
    null = true
    type = text
  }
  column "location_text" {
    null = true
    type = text
  }
  column "website_url" {
    null = true
    type = text
  }
  column "avatar_media_id" {
    null = true
    type = uuid
  }
  column "is_local" {
    null    = false
    type    = boolean
    default = true
  }
  column "home_server" {
    null = true
    type = text
  }
  column "canonical_uri" {
    null = true
    type = text
  }
  column "inbox_uri" {
    null = true
    type = text
  }
  column "outbox_uri" {
    null = true
    type = text
  }
  column "federation_state" {
    null = true
    type = text
  }
  column "moved_to_uri" {
    null = true
    type = text
  }
  column "also_known_as" {
    null = true
    type = jsonb
  }
  column "nameplate" {
    null = true
    type = jsonb
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "deleted_at" {
    null = true
    type = timestamptz
  }
  column "client_request_id" {
    null = true
    type = uuid
  }
  column "public_key_pem" {
    null = true
    type = text
  }
  column "shared_inbox_uri" {
    null = true
    type = text
  }
  column "last_fetched_at" {
    null = true
    type = timestamptz
  }
  column "profile_banner_url" {
    null = true
    type = text
  }
  column "profile_frame" {
    null = true
    type = character_varying(31)
  }
  column "name_tag_style" {
    null = true
    type = character_varying(31)
  }
  column "accent_color" {
    null = true
    type = character_varying(31)
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_actors_avatar_media_id" {
    columns     = [column.avatar_media_id]
    ref_columns = [table.media.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }
  foreign_key "fk_actors_user_id" {
    columns     = [column.user_id]
    ref_columns = [table.users.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }
  index "idx_actors_canonical_uri" {
    unique  = true
    columns = [column.canonical_uri]
  }
  index "idx_actors_client_request_id_handle_normalized" {
    unique  = true
    columns = [column.handle_normalized, column.client_request_id]
  }
  index "idx_actors_handle_normalized" {
    unique  = true
    columns = [column.handle_normalized]
  }
  unique "uq_actors_user_id" {
    columns = [column.user_id]
  }
}
table "admin_audit_log" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "admin_user_id" {
    null = false
    type = uuid
  }
  column "action" {
    null = false
    type = text
  }
  column "subject_type" {
    null = false
    type = text
  }
  column "subject_id" {
    null = false
    type = text
  }
  column "metadata" {
    null = true
    type = jsonb
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  index "idx_admin_audit_log_created_at" {
    columns = [column.created_at]
  }
  index "idx_admin_audit_log_subject_id_subject_type" {
    columns = [column.subject_type, column.subject_id]
  }
  check "chk_admin_audit_log_subject_type" {
    expr = "(subject_type = ANY (ARRAY['USER'::text, 'INVITE'::text, 'REPORT'::text, 'POST'::text, 'JOB'::text, 'DOMAIN'::text, 'COMMUNITY'::text, 'LABELER'::text]))"
  }
}
table "app_meta" {
  schema = schema.public
  column "key" {
    null = false
    type = text
  }
  column "value" {
    null = false
    type = jsonb
  }
  column "updated_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.key]
  }
}
table "appeals" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "admin_audit_log_id" {
    null = false
    type = uuid
  }
  column "statement" {
    null = false
    type = text
  }
  column "status" {
    null    = false
    type    = text
    default = "OPEN"
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "resolved_at" {
    null = true
    type = timestamptz
  }
  column "resolved_by_user_id" {
    null = true
    type = uuid
  }
  column "resolution_reason" {
    null = true
    type = text
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_appeals_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_appeals_admin_audit_log_id" {
    columns     = [column.admin_audit_log_id]
    ref_columns = [table.admin_audit_log.column.id]
    on_update   = NO_ACTION
    on_delete   = RESTRICT
  }
  foreign_key "fk_appeals_resolved_by_user_id" {
    columns     = [column.resolved_by_user_id]
    ref_columns = [table.users.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }
  index "idx_appeals_admin_audit_log_id" {
    unique  = true
    columns = [column.admin_audit_log_id]
  }
  check "chk_appeals_status" {
    expr = "(status = ANY (ARRAY['OPEN'::text, 'UPHELD'::text, 'OVERTURNED'::text, 'MODIFIED'::text]))"
  }
}
table "auth_codes" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "user_id" {
    null = false
    type = uuid
  }
  column "purpose" {
    null = false
    type = text
  }
  column "code_hash" {
    null = false
    type = text
  }
  column "expires_at" {
    null = false
    type = timestamptz
  }
  column "consumed_at" {
    null = true
    type = timestamptz
  }
  column "attempts" {
    null    = false
    type    = integer
    default = 0
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_auth_codes_user_id" {
    columns     = [column.user_id]
    ref_columns = [table.users.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_auth_codes_code_hash" {
    columns = [column.code_hash]
  }
  index "idx_auth_codes_created_at_purpose_user_id" {
    columns = [column.user_id, column.purpose, column.created_at]
  }
  check "chk_auth_codes_purpose" {
    expr = "(purpose = ANY (ARRAY['VERIFY_EMAIL'::text, 'RESET_PASSWORD'::text]))"
  }
}
table "blocks" {
  schema = schema.public
  column "blocker_actor_id" {
    null = false
    type = uuid
  }
  column "blocked_actor_id" {
    null = false
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.blocker_actor_id, column.blocked_actor_id]
  }
  foreign_key "fk_blocks_blocked_actor_id" {
    columns     = [column.blocked_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_blocks_blocker_actor_id" {
    columns     = [column.blocker_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  check "chk_blocks_no_self_block" {
    expr = "(blocker_actor_id <> blocked_actor_id)"
  }
}
table "bookmarks" {
  schema = schema.public
  column "actor_id" {
    null = false
    type = uuid
  }
  column "post_id" {
    null = false
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.actor_id, column.post_id]
  }
  foreign_key "fk_bookmarks_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_bookmarks_post_id" {
    columns     = [column.post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_bookmarks_actor_id_created_at_post_id" {
    columns = [column.actor_id, column.created_at, column.post_id]
  }
}
table "communities" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "name" {
    null = false
    type = text
  }
  column "display_name" {
    null = false
    type = text
  }
  column "description" {
    null    = false
    type    = text
    default = ""
  }
  column "rules" {
    null    = false
    type    = text
    default = ""
  }
  column "created_by_actor_id" {
    null = false
    type = uuid
  }
  column "is_public" {
    null    = false
    type    = boolean
    default = true
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "client_request_id" {
    null = true
    type = uuid
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_communities_created_by_actor_id" {
    columns     = [column.created_by_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = RESTRICT
  }
  index "idx_communities_client_request_id_created_by_actor_id" {
    unique  = true
    columns = [column.created_by_actor_id, column.client_request_id]
  }
  index "idx_communities_name" {
    unique  = true
    columns = [column.name]
  }
  check "chk_communities_name" {
    expr = "(name ~ '^[a-z0-9_]{3,32}$'::text)"
  }
}
table "community_bans" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "community_id" {
    null = false
    type = uuid
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "reason" {
    null = true
    type = text
  }
  column "banned_by_actor_id" {
    null = true
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_community_bans_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_community_bans_banned_by_actor_id" {
    columns     = [column.banned_by_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }
  foreign_key "fk_community_bans_community_id" {
    columns     = [column.community_id]
    ref_columns = [table.communities.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_community_bans_actor_id_community_id_created_at" {
    columns = [column.community_id, column.actor_id, column.created_at]
  }
}
table "community_invites" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "community_id" {
    null = false
    type = uuid
  }
  column "inviter_actor_id" {
    null = false
    type = uuid
  }
  column "invitee_actor_id" {
    null = false
    type = uuid
  }
  column "status" {
    null    = false
    type    = text
    default = "PENDING"
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_community_invites_community_id" {
    columns     = [column.community_id]
    ref_columns = [table.communities.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_community_invites_invitee_actor_id" {
    columns     = [column.invitee_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_community_invites_inviter_actor_id" {
    columns     = [column.inviter_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_community_invites_community_id_invitee_actor_id" {
    unique  = true
    columns = [column.community_id, column.invitee_actor_id]
    where   = "(status = 'PENDING'::text)"
  }
  index "idx_community_invites_created_at_id_invitee_actor_id" {
    columns = [column.invitee_actor_id, column.created_at, column.id]
  }
  check "chk_community_invites_status" {
    expr = "(status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'DECLINED'::text]))"
  }
}
table "community_members" {
  schema = schema.public
  column "community_id" {
    null = false
    type = uuid
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "role" {
    null    = false
    type    = text
    default = "MEMBER"
  }
  column "joined_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.community_id, column.actor_id]
  }
  foreign_key "fk_community_members_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_community_members_community_id" {
    columns     = [column.community_id]
    ref_columns = [table.communities.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_community_members_actor_id_community_id_joined_at" {
    columns = [column.community_id, column.joined_at, column.actor_id]
  }
  check "chk_community_members_role" {
    expr = "(role = ANY (ARRAY['MEMBER'::text, 'MODERATOR'::text]))"
  }
}
table "conversation_members" {
  schema = schema.public
  column "conversation_id" {
    null = false
    type = uuid
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "joined_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "left_at" {
    null = true
    type = timestamptz
  }
  column "last_read_message_id" {
    null = true
    type = uuid
  }
  column "muted" {
    null    = false
    type    = boolean
    default = false
  }
  primary_key {
    columns = [column.conversation_id, column.actor_id]
  }
  foreign_key "fk_conversation_members_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_conversation_members_conversation_id" {
    columns     = [column.conversation_id]
    ref_columns = [table.conversations.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
}
table "conversations" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "kind" {
    null    = false
    type    = text
    default = "DIRECT"
  }
  column "created_by_actor_id" {
    null = true
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "last_message_at" {
    null = false
    type = timestamptz
  }
  column "security_mode" {
    null    = false
    type    = text
    default = "E2EE_V1"
  }
  column "membership_epoch" {
    null    = false
    type    = bigint
    default = 1
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_conversations_created_by_actor_id" {
    columns     = [column.created_by_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }
  check "chk_conversations_kind" {
    expr = "(kind = ANY (ARRAY['DIRECT'::text, 'GROUP'::text]))"
  }
  check "chk_conversations_security_mode" {
    expr = "(security_mode = 'E2EE_V1'::text)"
  }
}
table "credentials" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "user_id" {
    null = false
    type = uuid
  }
  column "type" {
    null = false
    type = text
  }
  column "identifier" {
    null = true
    type = text
  }
  column "secret_hash" {
    null = true
    type = text
  }
  column "public_material" {
    null = true
    type = text
  }
  column "metadata" {
    null = true
    type = jsonb
  }
  column "label" {
    null = true
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "last_used_at" {
    null = true
    type = timestamptz
  }
  column "revoked_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_credentials_user_id" {
    columns     = [column.user_id]
    ref_columns = [table.users.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_credentials_identifier_type" {
    unique  = true
    columns = [column.type, column.identifier]
    where   = "((revoked_at IS NULL) AND (identifier IS NOT NULL))"
  }
  index "idx_credentials_type_user_id" {
    columns = [column.user_id, column.type]
  }
  index "idx_credentials_user_id" {
    unique  = true
    columns = [column.user_id]
    where   = "((type = 'PASSWORD'::text) AND (revoked_at IS NULL))"
  }
  check "chk_credentials_type" {
    expr = "(type = ANY (ARRAY['PASSWORD'::text, 'SSH_PUBLIC_KEY'::text, 'GITHUB'::text, 'PASSKEY'::text, 'RECOVERY_CODE'::text, 'OIDC'::text]))"
  }
}
table "domain_blocks" {
  schema = schema.public
  column "domain" {
    null = false
    type = text
  }
  column "reason" {
    null = true
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "reason_category" {
    null    = false
    type    = text
    default = "OTHER"
  }
  column "source" {
    null    = false
    type    = text
    default = "MANUAL"
  }
  primary_key {
    columns = [column.domain]
  }
  check "chk_domain_blocks_reason_category" {
    expr = "(reason_category = ANY (ARRAY['HARASSMENT'::text, 'HATE'::text, 'THREATS'::text, 'DOXXING'::text, 'IMPERSONATION'::text, 'SPAM'::text, 'ILLEGAL_CONTENT'::text, 'NCII'::text, 'INFRASTRUCTURE_ABUSE'::text, 'OTHER'::text]))"
  }
  check "chk_domain_blocks_source" {
    expr = "(source = ANY (ARRAY['MANUAL'::text, 'IMPORTED'::text]))"
  }
}
table "e2ee_conversation_membership_events" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "conversation_id" {
    null = false
    type = uuid
  }
  column "epoch" {
    null = false
    type = bigint
  }
  column "previous_digest" {
    null = false
    type = bytea
  }
  column "digest" {
    null = false
    type = bytea
  }
  column "event_bytes" {
    null = false
    type = bytea
  }
  column "action" {
    null = false
    type = text
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "target_actor_id" {
    null = true
    type = uuid
  }
  column "member_actor_ids" {
    null = false
    type = sql("text[]")
  }
  column "root_generation" {
    null = true
    type = integer
  }
  column "root_signature" {
    null = true
    type = bytea
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_e2ee_conversation_membership_events_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_e2ee_conversation_membership_events_conversation_id" {
    columns     = [column.conversation_id]
    ref_columns = [table.conversations.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_e2ee_conversation_membership_events_conversation_id_epoch" {
    unique  = true
    columns = [column.conversation_id, column.epoch]
  }
  index "idx_e2ee_conversation_membership_events_digest" {
    unique  = true
    columns = [column.digest]
  }
  check "chk_e2ee_membership_events_action" {
    expr = "(action = ANY (ARRAY['GENESIS'::text, 'ADD'::text, 'REMOVE'::text]))"
  }
  check "chk_e2ee_membership_events_digest_lengths" {
    expr = "((octet_length(previous_digest) = 32) AND (octet_length(digest) = 32))"
  }
  check "chk_e2ee_membership_events_epoch" {
    expr = "(epoch > 0)"
  }
  check "chk_e2ee_membership_events_signature" {
    expr = "(((action = 'GENESIS'::text) AND (root_signature IS NULL) AND (root_generation IS NULL) AND (target_actor_id IS NULL)) OR ((action <> 'GENESIS'::text) AND (octet_length(root_signature) = 64) AND (root_generation IS NOT NULL) AND (target_actor_id IS NOT NULL)))"
  }
}
table "e2ee_device_identities" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "identity_root_id" {
    null = false
    type = uuid
  }
  column "device_id" {
    null = false
    type = uuid
  }
  column "generation" {
    null = false
    type = integer
  }
  column "signing_public_key" {
    null = false
    type = bytea
  }
  column "agreement_public_key" {
    null = false
    type = bytea
  }
  column "certificate_bytes" {
    null = false
    type = bytea
  }
  column "root_signature" {
    null = false
    type = bytea
  }
  column "certificate_created_at" {
    null = false
    type = timestamptz
  }
  column "expires_at" {
    null = false
    type = timestamptz
  }
  column "registered_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "revoked_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_e2ee_device_identities_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_e2ee_device_identities_identity_root_id" {
    columns     = [column.identity_root_id]
    ref_columns = [table.e2ee_identity_roots.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_e2ee_device_identities_actor_id_device_id" {
    unique  = true
    columns = [column.actor_id, column.device_id]
    where   = "(revoked_at IS NULL)"
  }
  index "idx_e2ee_device_identities_actor_id_device_id_generation" {
    unique  = true
    columns = [column.actor_id, column.device_id, column.generation]
  }
  index "idx_e2ee_device_identities_actor_id_revoked_at" {
    columns = [column.actor_id, column.revoked_at]
  }
  check "chk_e2ee_device_identities_generation" {
    expr = "(generation > 0)"
  }
  check "chk_e2ee_device_identities_key_lengths" {
    expr = "((octet_length(signing_public_key) = 32) AND (octet_length(agreement_public_key) = 32))"
  }
  check "chk_e2ee_device_identities_signature_length" {
    expr = "(octet_length(root_signature) = 64)"
  }
  check "chk_e2ee_device_identities_validity" {
    expr = "(expires_at > certificate_created_at)"
  }
}
table "e2ee_device_rosters" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "sequence" {
    null = false
    type = bigint
  }
  column "previous_digest" {
    null = false
    type = bytea
  }
  column "digest" {
    null = false
    type = bytea
  }
  column "roster_bytes" {
    null = false
    type = bytea
  }
  column "root_signature" {
    null = false
    type = bytea
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_e2ee_device_rosters_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_e2ee_device_rosters_actor_id_sequence" {
    unique  = true
    columns = [column.actor_id, column.sequence]
  }
  index "idx_e2ee_device_rosters_digest" {
    unique  = true
    columns = [column.digest]
  }
  check "chk_e2ee_device_rosters_digest_lengths" {
    expr = "((octet_length(previous_digest) = 32) AND (octet_length(digest) = 32))"
  }
  check "chk_e2ee_device_rosters_sequence" {
    expr = "(sequence > 0)"
  }
  check "chk_e2ee_device_rosters_signature_length" {
    expr = "(octet_length(root_signature) = 64)"
  }
}
table "e2ee_group_control_events" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "conversation_id" {
    null = false
    type = uuid
  }
  column "epoch" {
    null = false
    type = bigint
  }
  column "change_kind" {
    null = false
    type = text
  }
  column "subject_actor_id" {
    null = false
    type = uuid
  }
  column "signer_actor_id" {
    null = false
    type = uuid
  }
  column "signer_device_id" {
    null = false
    type = uuid
  }
  column "previous_digest" {
    null = false
    type = bytea
  }
  column "digest" {
    null = false
    type = bytea
  }
  column "event_bytes" {
    null = false
    type = bytea
  }
  column "device_signature" {
    null = false
    type = bytea
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_e2ee_group_control_events_conversation_id" {
    columns     = [column.conversation_id]
    ref_columns = [table.conversations.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_e2ee_group_control_events_conversation_id_epoch" {
    unique  = true
    columns = [column.conversation_id, column.epoch]
  }
  check "chk_e2ee_group_control_events_change" {
    expr = "(change_kind = ANY (ARRAY['ADDED'::text, 'REMOVED'::text]))"
  }
  check "chk_e2ee_group_control_events_digest_lengths" {
    expr = "((octet_length(previous_digest) = 32) AND (octet_length(digest) = 32))"
  }
  check "chk_e2ee_group_control_events_epoch" {
    expr = "(epoch >= 2)"
  }
}
table "e2ee_identity_roots" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "generation" {
    null = false
    type = integer
  }
  column "public_key" {
    null = false
    type = bytea
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "rotated_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_e2ee_identity_roots_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_e2ee_identity_roots_actor_id" {
    unique  = true
    columns = [column.actor_id]
    where   = "(rotated_at IS NULL)"
  }
  index "idx_e2ee_identity_roots_actor_id_generation" {
    unique  = true
    columns = [column.actor_id, column.generation]
  }
  check "chk_e2ee_identity_roots_generation" {
    expr = "(generation > 0)"
  }
  check "chk_e2ee_identity_roots_key_length" {
    expr = "(octet_length(public_key) = 32)"
  }
}
table "e2ee_logical_messages" {
  schema = schema.public
  column "id" {
    null = false
    type = uuid
  }
  column "conversation_id" {
    null = false
    type = uuid
  }
  column "epoch" {
    null = false
    type = bigint
  }
  column "sender_actor_id" {
    null = false
    type = uuid
  }
  column "sender_device_id" {
    null = false
    type = uuid
  }
  column "client_request_id" {
    null = false
    type = uuid
  }
  column "fanout_digest" {
    null = false
    type = bytea
  }
  column "franking_commitment" {
    null = false
    type = bytea
  }
  column "franking_profile" {
    null = false
    type = text
  }
  column "franking_key_era" {
    null = false
    type = integer
  }
  column "franking_tag" {
    null = false
    type = bytea
  }
  column "accepted_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "deleted_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_e2ee_logical_messages_conversation_id" {
    columns     = [column.conversation_id]
    ref_columns = [table.conversations.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_e2ee_logical_messages_accepted_at_conversation_id_id" {
    columns = [column.conversation_id, column.accepted_at, column.id]
  }
  index "idx_e2ee_logical_messages_client_request_id_sender_actor_id" {
    unique  = true
    columns = [column.sender_actor_id, column.client_request_id]
  }
  check "chk_e2ee_logical_messages_digest_lengths" {
    expr = "((octet_length(fanout_digest) = 32) AND (octet_length(franking_commitment) = 32))"
  }
  check "chk_e2ee_logical_messages_epoch" {
    expr = "(epoch > 0)"
  }
  check "chk_e2ee_logical_messages_franking_era" {
    expr = "(franking_key_era > 0)"
  }
}
table "e2ee_mailbox_envelopes" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "logical_message_id" {
    null = false
    type = uuid
  }
  column "recipient_device_identity_id" {
    null = false
    type = uuid
  }
  column "encrypted_header" {
    null = false
    type = bytea
  }
  column "ciphertext" {
    null = false
    type = bytea
  }
  column "opening_ciphertext" {
    null = false
    type = bytea
  }
  column "ciphertext_digest" {
    null = false
    type = bytea
  }
  column "received_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "acknowledged_at" {
    null = true
    type = timestamptz
  }
  column "deleted_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_e2ee_mailbox_envelopes_logical_message_id" {
    columns     = [column.logical_message_id]
    ref_columns = [table.e2ee_logical_messages.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_e2ee_mailbox_envelopes_recipient_device_identity_id" {
    columns     = [column.recipient_device_identity_id]
    ref_columns = [table.e2ee_device_identities.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_e2ee_mailbox_envelopes_acknowledged_at_id" {
    columns = [column.acknowledged_at, column.id]
    where   = "(acknowledged_at IS NOT NULL)"
  }
  index "idx_e2ee_mailbox_envelopes_id_received_at_recipient_device_iden" {
    columns = [column.recipient_device_identity_id, column.received_at, column.id]
    where   = "((acknowledged_at IS NULL) AND (deleted_at IS NULL))"
  }
  index "idx_e2ee_mailbox_envelopes_logical_message_id_recipient_device_" {
    unique  = true
    columns = [column.logical_message_id, column.recipient_device_identity_id]
  }
  check "chk_e2ee_mailbox_envelopes_digest_length" {
    expr = "(octet_length(ciphertext_digest) = 32)"
  }
  check "chk_e2ee_mailbox_envelopes_size" {
    expr = "(((octet_length(encrypted_header) + octet_length(ciphertext)) + octet_length(opening_ciphertext)) <= 65536)"
  }
}
table "e2ee_node_franking_keys" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "era" {
    null = false
    type = integer
  }
  column "key_material" {
    null = false
    type = bytea
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  index "idx_e2ee_node_franking_keys_era" {
    unique  = true
    columns = [column.era]
  }
  check "chk_e2ee_node_franking_keys_era" {
    expr = "(era > 0)"
  }
  check "chk_e2ee_node_franking_keys_key_length" {
    expr = "(octet_length(key_material) = 32)"
  }
}
table "e2ee_one_time_prekey_key_ids" {
  schema = schema.public
  column "device_identity_id" {
    null = false
    type = uuid
  }
  column "key_id" {
    null = false
    type = bigint
  }
  column "issued_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "consumed_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.device_identity_id, column.key_id]
  }
  foreign_key "fk_e2ee_one_time_prekey_key_ids_device_identity_id" {
    columns     = [column.device_identity_id]
    ref_columns = [table.e2ee_device_identities.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  check "chk_e2ee_one_time_prekey_key_ids_key_id" {
    expr = "(key_id > 0)"
  }
}
table "e2ee_one_time_prekeys" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "device_identity_id" {
    null = false
    type = uuid
  }
  column "key_id" {
    null = false
    type = bigint
  }
  column "public_key" {
    null = false
    type = bytea
  }
  column "uploaded_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "consumed_at" {
    null = true
    type = timestamptz
  }
  column "consumed_by_logical_message_id" {
    null = true
    type = uuid
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_e2ee_one_time_prekeys_device_identity_id" {
    columns     = [column.device_identity_id]
    ref_columns = [table.e2ee_device_identities.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_e2ee_one_time_prekeys_device_identity_id_key_id" {
    columns     = [column.device_identity_id, column.key_id]
    ref_columns = [table.e2ee_one_time_prekey_key_ids.column.device_identity_id, table.e2ee_one_time_prekey_key_ids.column.key_id]
    on_update   = NO_ACTION
    on_delete   = RESTRICT
  }
  index "idx_e2ee_one_time_prekeys_consumed_at_device_identity_id_id" {
    columns = [column.device_identity_id, column.consumed_at, column.id]
  }
  index "idx_e2ee_one_time_prekeys_consumed_at_id" {
    columns = [column.consumed_at, column.id]
    where   = "(consumed_at IS NOT NULL)"
  }
  index "idx_e2ee_one_time_prekeys_device_identity_id_id" {
    columns = [column.device_identity_id, column.id]
    where   = "(consumed_at IS NULL)"
  }
  index "idx_e2ee_one_time_prekeys_device_identity_id_key_id" {
    unique  = true
    columns = [column.device_identity_id, column.key_id]
  }
  check "chk_e2ee_one_time_prekeys_key_id" {
    expr = "(key_id > 0)"
  }
  check "chk_e2ee_one_time_prekeys_public_key_length" {
    expr = "(octet_length(public_key) = 32)"
  }
}
table "e2ee_report_evidence" {
  schema = schema.public
  column "report_id" {
    null = false
    type = uuid
  }
  column "verification_status" {
    null    = false
    type    = text
    default = "PENDING"
  }
  column "consented_at" {
    null = false
    type = timestamptz
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "verified_at" {
    null = true
    type = timestamptz
  }
  column "verification_failure_code" {
    null = true
    type = text
  }
  primary_key {
    columns = [column.report_id]
  }
  foreign_key "fk_e2ee_report_evidence_report_id" {
    columns     = [column.report_id]
    ref_columns = [table.reports.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  check "chk_e2ee_report_evidence_status" {
    expr = "(verification_status = ANY (ARRAY['PENDING'::text, 'VERIFIED'::text, 'UNVERIFIABLE'::text]))"
  }
}
table "e2ee_report_evidence_items" {
  schema = schema.public
  column "report_id" {
    null = false
    type = uuid
  }
  column "position" {
    null = false
    type = smallint
  }
  column "logical_message_id" {
    null = false
    type = uuid
  }
  column "disclosed_plaintext" {
    null = false
    type = bytea
  }
  column "opening" {
    null = false
    type = bytea
  }
  column "envelope_transcript" {
    null = false
    type = bytea
  }
  column "franking_tag" {
    null = false
    type = bytea
  }
  column "participant_transcript" {
    null = false
    type = bytea
  }
  column "roster_digest" {
    null = false
    type = bytea
  }
  primary_key {
    columns = [column.report_id, column.position]
  }
  foreign_key "fk_e2ee_report_evidence_items_report_id" {
    columns     = [column.report_id]
    ref_columns = [table.e2ee_report_evidence.column.report_id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_e2ee_report_evidence_items_logical_message_id_report_id" {
    unique  = true
    columns = [column.report_id, column.logical_message_id]
  }
  check "chk_e2ee_report_evidence_items_digest_length" {
    expr = "(octet_length(roster_digest) = 32)"
  }
  check "chk_e2ee_report_evidence_items_position" {
    expr = "((\"position\" >= 0) AND (\"position\" <= 10))"
  }
  check "chk_e2ee_report_evidence_items_sizes" {
    expr = "((octet_length(disclosed_plaintext) <= 8192) AND (octet_length(opening) <= 4096) AND (octet_length(envelope_transcript) <= 65536))"
  }
}
table "e2ee_signed_prekeys" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "device_identity_id" {
    null = false
    type = uuid
  }
  column "key_id" {
    null = false
    type = bigint
  }
  column "public_key" {
    null = false
    type = bytea
  }
  column "signature" {
    null = false
    type = bytea
  }
  column "created_at" {
    null = false
    type = timestamptz
  }
  column "expires_at" {
    null = false
    type = timestamptz
  }
  column "retired_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_e2ee_signed_prekeys_device_identity_id" {
    columns     = [column.device_identity_id]
    ref_columns = [table.e2ee_device_identities.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_e2ee_signed_prekeys_device_identity_id" {
    unique  = true
    columns = [column.device_identity_id]
    where   = "(retired_at IS NULL)"
  }
  index "idx_e2ee_signed_prekeys_device_identity_id_expires_at" {
    columns = [column.device_identity_id, column.expires_at]
  }
  index "idx_e2ee_signed_prekeys_device_identity_id_key_id" {
    unique  = true
    columns = [column.device_identity_id, column.key_id]
  }
  index "idx_e2ee_signed_prekeys_retired_at_id" {
    columns = [column.retired_at, column.id]
    where   = "(retired_at IS NOT NULL)"
  }
  check "chk_e2ee_signed_prekeys_key_id" {
    expr = "(key_id > 0)"
  }
  check "chk_e2ee_signed_prekeys_public_key_length" {
    expr = "(octet_length(public_key) = 32)"
  }
  check "chk_e2ee_signed_prekeys_signature_length" {
    expr = "(octet_length(signature) = 64)"
  }
  check "chk_e2ee_signed_prekeys_validity" {
    expr = "(expires_at > created_at)"
  }
}
table "federation_keys" {
  schema = schema.public
  column "actor_id" {
    null = false
    type = uuid
  }
  column "public_key_pem" {
    null = false
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "private_key_ciphertext" {
    null = false
    type = bytea
  }
  column "private_key_iv" {
    null = false
    type = bytea
  }
  column "private_key_tag" {
    null = false
    type = bytea
  }
  primary_key {
    columns = [column.actor_id]
  }
  foreign_key "fk_federation_keys_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
}
table "filter_list_entries" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "filter_list_id" {
    null = false
    type = uuid
  }
  column "kind" {
    null = false
    type = text
  }
  column "value" {
    null = false
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_filter_list_entries_filter_list_id" {
    columns     = [column.filter_list_id]
    ref_columns = [table.filter_lists.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_filter_list_entries_filter_list_id" {
    columns = [column.filter_list_id]
  }
  check "chk_filter_list_entries_kind" {
    expr = "(kind = ANY (ARRAY['SUBSTRING'::text, 'WORD'::text, 'TAG'::text, 'ACTOR'::text, 'DOMAIN'::text]))"
  }
}
table "filter_list_exceptions" {
  schema = schema.public
  column "actor_id" {
    null = false
    type = uuid
  }
  column "filter_list_id" {
    null = false
    type = uuid
  }
  column "filter_list_entry_id" {
    null = false
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.actor_id, column.filter_list_id, column.filter_list_entry_id]
  }
  foreign_key "fk_filter_list_exceptions_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_filter_list_exceptions_filter_list_entry_id" {
    columns     = [column.filter_list_entry_id]
    ref_columns = [table.filter_list_entries.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_filter_list_exceptions_filter_list_id" {
    columns     = [column.filter_list_id]
    ref_columns = [table.filter_lists.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
}
table "filter_list_subscriptions" {
  schema = schema.public
  column "actor_id" {
    null = false
    type = uuid
  }
  column "filter_list_id" {
    null = false
    type = uuid
  }
  column "action" {
    null = false
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "scopes" {
    null    = false
    type    = sql("text[]")
    default = "{HOME,LOCAL,TAG_FEED,COMMUNITY_FEED,NOTIFICATIONS,SEARCH}"
  }
  primary_key {
    columns = [column.actor_id, column.filter_list_id]
  }
  foreign_key "fk_filter_list_subscriptions_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_filter_list_subscriptions_filter_list_id" {
    columns     = [column.filter_list_id]
    ref_columns = [table.filter_lists.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  check "chk_filter_list_subscriptions_action" {
    expr = "(action = ANY (ARRAY['HIDE'::text, 'COLLAPSE'::text, 'WARN'::text]))"
  }
}
table "filter_lists" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "owner_actor_id" {
    null = true
    type = uuid
  }
  column "owner_community_id" {
    null = true
    type = uuid
  }
  column "name" {
    null = false
    type = text
  }
  column "display_name" {
    null = false
    type = text
  }
  column "description" {
    null    = false
    type    = text
    default = ""
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_filter_lists_owner_actor_id" {
    columns     = [column.owner_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_filter_lists_owner_community_id" {
    columns     = [column.owner_community_id]
    ref_columns = [table.communities.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_filter_lists_name_owner_actor_id" {
    unique  = true
    columns = [column.owner_actor_id, column.name]
  }
  index "idx_filter_lists_name_owner_community_id" {
    unique  = true
    columns = [column.owner_community_id, column.name]
  }
  check "chk_filter_lists_one_owner" {
    expr = "(((owner_actor_id IS NOT NULL) AND (owner_community_id IS NULL)) OR ((owner_actor_id IS NULL) AND (owner_community_id IS NOT NULL)))"
  }
}
table "filter_scopes" {
  schema = schema.public
  column "filter_id" {
    null = false
    type = uuid
  }
  column "scope" {
    null = false
    type = text
  }
  primary_key {
    columns = [column.filter_id, column.scope]
  }
  foreign_key "fk_filter_scopes_filter_id" {
    columns     = [column.filter_id]
    ref_columns = [table.filters.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  check "chk_filter_scopes_scope" {
    expr = "(scope = ANY (ARRAY['HOME'::text, 'LOCAL'::text, 'TAG_FEED'::text, 'COMMUNITY_FEED'::text, 'NOTIFICATIONS'::text, 'SEARCH'::text]))"
  }
}
table "filter_terms" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "filter_id" {
    null = false
    type = uuid
  }
  column "kind" {
    null = false
    type = text
  }
  column "value" {
    null = false
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_filter_terms_filter_id" {
    columns     = [column.filter_id]
    ref_columns = [table.filters.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_filter_terms_filter_id" {
    columns = [column.filter_id]
  }
  check "chk_filter_terms_kind" {
    expr = "(kind = ANY (ARRAY['SUBSTRING'::text, 'WORD'::text, 'TAG'::text, 'ACTOR'::text, 'DOMAIN'::text]))"
  }
}
table "filters" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "name" {
    null = false
    type = text
  }
  column "action" {
    null = false
    type = text
  }
  column "expires_at" {
    null = true
    type = timestamptz
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_filters_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_filters_actor_id" {
    columns = [column.actor_id]
  }
  check "chk_filters_action" {
    expr = "(action = ANY (ARRAY['HIDE'::text, 'COLLAPSE'::text, 'WARN'::text]))"
  }
}
table "follow_requests" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "requester_actor_id" {
    null = false
    type = uuid
  }
  column "target_actor_id" {
    null = false
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_follow_requests_requester_actor_id" {
    columns     = [column.requester_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_follow_requests_target_actor_id" {
    columns     = [column.target_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_follow_requests_created_at_id_target_actor_id" {
    columns = [column.target_actor_id, column.created_at, column.id]
  }
  index "idx_follow_requests_requester_actor_id_target_actor_id" {
    unique  = true
    columns = [column.requester_actor_id, column.target_actor_id]
  }
}
table "follows" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "follower_actor_id" {
    null = false
    type = uuid
  }
  column "followee_actor_id" {
    null = false
    type = uuid
  }
  column "status" {
    null    = false
    type    = text
    default = "FOLLOWING"
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "accepted_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_follows_followee_actor_id" {
    columns     = [column.followee_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_follows_follower_actor_id" {
    columns     = [column.follower_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_follows_created_at_followee_actor_id_id" {
    columns = [column.followee_actor_id, column.created_at, column.id]
  }
  index "idx_follows_created_at_follower_actor_id_id" {
    columns = [column.follower_actor_id, column.created_at, column.id]
  }
  index "idx_follows_followee_actor_id_follower_actor_id" {
    unique  = true
    columns = [column.follower_actor_id, column.followee_actor_id]
  }
  check "chk_follows_no_self_follow" {
    expr = "(follower_actor_id <> followee_actor_id)"
  }
  check "chk_follows_status" {
    expr = "(status = ANY (ARRAY['PENDING'::text, 'FOLLOWING'::text]))"
  }
}
table "guestbook_entries" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "page_id" {
    null = false
    type = uuid
  }
  column "author_actor_id" {
    null = true
    type = uuid
  }
  column "body" {
    null = false
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "removed_at" {
    null = true
    type = timestamptz
  }
  column "removed_by_actor_id" {
    null = true
    type = uuid
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_guestbook_entries_author_actor_id" {
    columns     = [column.author_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }
  foreign_key "fk_guestbook_entries_page_id" {
    columns     = [column.page_id]
    ref_columns = [table.pages.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_guestbook_entries_removed_by_actor_id" {
    columns     = [column.removed_by_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }
  index "idx_guestbook_entries_created_at_page_id" {
    columns = [column.page_id, column.created_at]
  }
}
table "inbox_activities" {
  schema = schema.public
  column "id" {
    null = false
    type = text
  }
  column "activity_type" {
    null = false
    type = text
  }
  column "actor_uri" {
    null = false
    type = text
  }
  column "received_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  index "idx_inbox_activities_received_at" {
    columns = [column.received_at]
  }
}
table "invites" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "code_hash" {
    null = false
    type = text
  }
  column "created_by_user_id" {
    null = false
    type = uuid
  }
  column "max_uses" {
    null    = false
    type    = integer
    default = 1
  }
  column "uses" {
    null    = false
    type    = integer
    default = 0
  }
  column "expires_at" {
    null = true
    type = timestamptz
  }
  column "revoked_at" {
    null = true
    type = timestamptz
  }
  column "note" {
    null = true
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_invites_created_by_user_id" {
    columns     = [column.created_by_user_id]
    ref_columns = [table.users.column.id]
    on_update   = NO_ACTION
    on_delete   = RESTRICT
  }
  index "idx_invites_code_hash" {
    unique  = true
    columns = [column.code_hash]
  }
  index "idx_invites_created_at_created_by_user_id" {
    columns = [column.created_by_user_id, column.created_at]
  }
  check "chk_invites_uses_within_max" {
    expr = "((uses >= 0) AND (max_uses >= 1) AND (uses <= max_uses))"
  }
}
table "labeler_subscription_actions" {
  schema = schema.public
  column "actor_id" {
    null = false
    type = uuid
  }
  column "labeler_id" {
    null = false
    type = uuid
  }
  column "value" {
    null = false
    type = text
  }
  column "action" {
    null = false
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.actor_id, column.labeler_id, column.value]
  }
  foreign_key "fk_labeler_subscription_actions_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_labeler_subscription_actions_labeler_id" {
    columns     = [column.labeler_id]
    ref_columns = [table.labelers.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  check "chk_labeler_subscription_actions_action" {
    expr = "(action = ANY (ARRAY['IGNORE'::text, 'WARN'::text, 'COLLAPSE'::text, 'HIDE'::text]))"
  }
}
table "labeler_subscriptions" {
  schema = schema.public
  column "actor_id" {
    null = false
    type = uuid
  }
  column "labeler_id" {
    null = false
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.actor_id, column.labeler_id]
  }
  foreign_key "fk_labeler_subscriptions_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_labeler_subscriptions_labeler_id" {
    columns     = [column.labeler_id]
    ref_columns = [table.labelers.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
}
table "labelers" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "actor_id" {
    null = true
    type = uuid
  }
  column "community_id" {
    null = true
    type = uuid
  }
  column "is_node_labeler" {
    null    = false
    type    = boolean
    default = false
  }
  column "vocabulary" {
    null = false
    type = jsonb
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_labelers_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_labelers_community_id" {
    columns     = [column.community_id]
    ref_columns = [table.communities.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  check "chk_labelers_one_owner" {
    expr = "(((actor_id IS NOT NULL) AND (community_id IS NULL) AND (is_node_labeler = false)) OR ((actor_id IS NULL) AND (community_id IS NOT NULL) AND (is_node_labeler = false)) OR ((actor_id IS NULL) AND (community_id IS NULL) AND (is_node_labeler = true)))"
  }
}
table "labels" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "labeler_id" {
    null = false
    type = uuid
  }
  column "subject_type" {
    null = false
    type = text
  }
  column "subject_actor_id" {
    null = true
    type = uuid
  }
  column "subject_post_id" {
    null = true
    type = uuid
  }
  column "value" {
    null = false
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "expires_at" {
    null = true
    type = timestamptz
  }
  column "retracted_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_labels_labeler_id" {
    columns     = [column.labeler_id]
    ref_columns = [table.labelers.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_labels_subject_actor_id" {
    columns     = [column.subject_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_labels_subject_post_id" {
    columns     = [column.subject_post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_labels_labeler_id_subject_actor_id" {
    columns = [column.labeler_id, column.subject_actor_id]
  }
  index "idx_labels_labeler_id_subject_post_id" {
    columns = [column.labeler_id, column.subject_post_id]
  }
  check "chk_labels_subject_matches_type" {
    expr = "(((subject_type = 'ACTOR'::text) AND (subject_actor_id IS NOT NULL) AND (subject_post_id IS NULL)) OR ((subject_type = 'POST'::text) AND (subject_post_id IS NOT NULL) AND (subject_actor_id IS NULL)))"
  }
  check "chk_labels_subject_type" {
    expr = "(subject_type = ANY (ARRAY['ACTOR'::text, 'POST'::text]))"
  }
}
table "likes" {
  schema = schema.public
  column "actor_id" {
    null = false
    type = uuid
  }
  column "post_id" {
    null = false
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.actor_id, column.post_id]
  }
  foreign_key "fk_likes_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_likes_post_id" {
    columns     = [column.post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_likes_actor_id_created_at_post_id" {
    columns = [column.post_id, column.created_at, column.actor_id]
  }
}
table "media" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "owner_actor_id" {
    null = false
    type = uuid
  }
  column "state" {
    null    = false
    type    = text
    default = "PENDING_UPLOAD"
  }
  column "source_object_key" {
    null = true
    type = text
  }
  column "display_object_key" {
    null = true
    type = text
  }
  column "thumbnail_object_key" {
    null = true
    type = text
  }
  column "mime_type" {
    null = true
    type = text
  }
  column "width" {
    null = true
    type = integer
  }
  column "height" {
    null = true
    type = integer
  }
  column "byte_size" {
    null = true
    type = bigint
  }
  column "alt_text" {
    null = true
    type = text
  }
  column "content_hash" {
    null = true
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "processed_at" {
    null = true
    type = timestamptz
  }
  column "deleted_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_media_owner_actor_id" {
    columns     = [column.owner_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = RESTRICT
  }
  index "idx_media_created_at_owner_actor_id" {
    columns = [column.owner_actor_id, column.created_at]
  }
  check "chk_media_state" {
    expr = "(state = ANY (ARRAY['PENDING_UPLOAD'::text, 'PROCESSING'::text, 'READY'::text, 'FAILED'::text, 'DELETED'::text]))"
  }
}
table "migrations" {
  schema = schema.public
  column "id" {
    null = false
    type = serial
  }
  column "timestamp" {
    null = false
    type = bigint
  }
  column "name" {
    null = false
    type = character_varying
  }
  primary_key {
    columns = [column.id]
  }
}
table "moderation_log_entries" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "action" {
    null = false
    type = text
  }
  column "subject_kind" {
    null = false
    type = text
  }
  column "subject_domain" {
    null = true
    type = text
  }
  column "reason_category" {
    null = false
    type = text
  }
  column "appealed" {
    null    = false
    type    = boolean
    default = false
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  index "idx_moderation_log_entries_created_at_id" {
    columns = [column.created_at, column.id]
  }
  check "chk_moderation_log_entries_action" {
    expr = "(action = ANY (ARRAY['WARN'::text, 'SUSPEND'::text, 'BAN'::text, 'POST_REMOVAL'::text, 'MEDIA_TAKEDOWN'::text, 'DOMAIN_BLOCK'::text]))"
  }
  check "chk_moderation_log_entries_reason_category" {
    expr = "(reason_category = ANY (ARRAY['HARASSMENT'::text, 'HATE'::text, 'THREATS'::text, 'DOXXING'::text, 'IMPERSONATION'::text, 'SPAM'::text, 'ILLEGAL_CONTENT'::text, 'NCII'::text, 'INFRASTRUCTURE_ABUSE'::text, 'OTHER'::text]))"
  }
  check "chk_moderation_log_entries_subject_domain" {
    expr = "(((subject_kind = 'DOMAIN'::text) AND (subject_domain IS NOT NULL)) OR ((subject_kind <> 'DOMAIN'::text) AND (subject_domain IS NULL)))"
  }
  check "chk_moderation_log_entries_subject_kind" {
    expr = "(subject_kind = ANY (ARRAY['DOMAIN'::text, 'ACCOUNT'::text, 'POST'::text, 'MEDIA'::text]))"
  }
}
table "mutes" {
  schema = schema.public
  column "muter_actor_id" {
    null = false
    type = uuid
  }
  column "muted_actor_id" {
    null = false
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.muter_actor_id, column.muted_actor_id]
  }
  foreign_key "fk_mutes_muted_actor_id" {
    columns     = [column.muted_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_mutes_muter_actor_id" {
    columns     = [column.muter_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  check "chk_mutes_no_self_mute" {
    expr = "(muter_actor_id <> muted_actor_id)"
  }
}
table "notifications" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "recipient_actor_id" {
    null = false
    type = uuid
  }
  column "type" {
    null = false
    type = text
  }
  column "actor_id" {
    null = true
    type = uuid
  }
  column "post_id" {
    null = true
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "read_at" {
    null = true
    type = timestamptz
  }
  column "conversation_id" {
    null = true
    type = uuid
  }
  column "community_id" {
    null = true
    type = uuid
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_notifications_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_notifications_community_id" {
    columns     = [column.community_id]
    ref_columns = [table.communities.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_notifications_conversation_id" {
    columns     = [column.conversation_id]
    ref_columns = [table.conversations.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_notifications_post_id" {
    columns     = [column.post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_notifications_recipient_actor_id" {
    columns     = [column.recipient_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_notifications_actor_id_post_id_recipient_actor_id_type" {
    unique  = true
    columns = [column.recipient_actor_id, column.type, column.actor_id, column.post_id]
    where   = "(post_id IS NOT NULL)"
  }
  index "idx_notifications_actor_id_recipient_actor_id_type" {
    unique  = true
    columns = [column.recipient_actor_id, column.type, column.actor_id]
    where   = "((post_id IS NULL) AND (conversation_id IS NULL) AND (community_id IS NULL) AND (type <> 'MESSAGE'::text))"
  }
  index "idx_notifications_community_id" {
    columns = [column.community_id]
  }
  index "idx_notifications_conversation_id_recipient_actor_id_type" {
    unique  = true
    columns = [column.recipient_actor_id, column.type, column.conversation_id]
    where   = "((conversation_id IS NOT NULL) AND (read_at IS NULL))"
  }
  index "idx_notifications_created_at_id_recipient_actor_id" {
    columns = [column.recipient_actor_id, column.created_at, column.id]
  }
  index "idx_notifications_read_at_recipient_actor_id" {
    columns = [column.recipient_actor_id, column.read_at]
  }
  check "chk_notifications_type" {
    expr = "(type = ANY (ARRAY['FOLLOW'::text, 'LIKE'::text, 'REPLY'::text, 'MENTION'::text, 'MODERATION'::text, 'MESSAGE'::text, 'REPOST'::text, 'QUOTE'::text, 'COMMUNITY_INVITE'::text, 'FOLLOW_REQUEST'::text, 'SECURITY'::text]))"
  }
}
table "outbox_jobs" {
  schema = schema.public
  column "id" {
    null = false
    type = bigserial
  }
  column "type" {
    null = false
    type = text
  }
  column "payload" {
    null = false
    type = jsonb
  }
  column "status" {
    null    = false
    type    = text
    default = "PENDING"
  }
  column "attempts" {
    null    = false
    type    = integer
    default = 0
  }
  column "max_attempts" {
    null    = false
    type    = integer
    default = 10
  }
  column "available_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "locked_at" {
    null = true
    type = timestamptz
  }
  column "locked_by" {
    null = true
    type = text
  }
  column "last_error" {
    null = true
    type = text
  }
  column "idempotency_key" {
    null = true
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "completed_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.id]
  }
  index "idx_outbox_jobs_available_at_id_status" {
    columns = [column.status, column.available_at, column.id]
  }
  index "idx_outbox_jobs_idempotency_key" {
    unique  = true
    columns = [column.idempotency_key]
  }
  check "chk_outbox_jobs_attempts" {
    expr = "((attempts >= 0) AND (max_attempts >= 1))"
  }
  check "chk_outbox_jobs_auth_email_payload" {
    expr = "((type <> ALL (ARRAY['SEND_VERIFICATION_EMAIL'::text, 'SEND_PASSWORD_RESET_EMAIL'::text])) OR (NOT (payload ?| ARRAY['code'::text, 'email'::text, 'userId'::text])))"
  }
  check "chk_outbox_jobs_status" {
    expr = "(status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'FAILED'::text, 'DEAD'::text]))"
  }
}
table "page_assets" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "page_id" {
    null = false
    type = uuid
  }
  column "media_id" {
    null = false
    type = uuid
  }
  column "byte_size" {
    null = false
    type = bigint
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_page_assets_media_id" {
    columns     = [column.media_id]
    ref_columns = [table.media.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_page_assets_page_id" {
    columns     = [column.page_id]
    ref_columns = [table.pages.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_page_assets_media_id_page_id" {
    unique  = true
    columns = [column.page_id, column.media_id]
  }
}
table "page_revisions" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "page_id" {
    null = false
    type = uuid
  }
  column "revision_number" {
    null = false
    type = integer
  }
  column "document" {
    null = false
    type = jsonb
  }
  column "byte_size" {
    null = false
    type = integer
  }
  column "created_by_actor_id" {
    null = false
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_page_revisions_created_by_actor_id" {
    columns     = [column.created_by_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_page_revisions_page_id" {
    columns     = [column.page_id]
    ref_columns = [table.pages.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_page_revisions_page_id_revision_number" {
    unique  = true
    columns = [column.page_id, column.revision_number]
  }
}
table "pages" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "current_revision_id" {
    null = true
    type = uuid
  }
  column "visibility" {
    null    = false
    type    = text
    default = "PUBLIC"
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_pages_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_pages_current_revision_id" {
    columns     = [column.current_revision_id]
    ref_columns = [table.page_revisions.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }
  index "idx_pages_actor_id" {
    unique  = true
    columns = [column.actor_id]
  }
  check "chk_pages_visibility" {
    expr = "(visibility = ANY (ARRAY['PUBLIC'::text, 'UNLISTED'::text]))"
  }
}
table "pinned_posts" {
  schema = schema.public
  column "actor_id" {
    null = false
    type = uuid
  }
  column "post_id" {
    null = false
    type = uuid
  }
  column "position" {
    null = false
    type = smallint
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.actor_id, column.post_id]
  }
  foreign_key "fk_pinned_posts_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_pinned_posts_post_id" {
    columns     = [column.post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  check "chk_pinned_posts_position" {
    expr = "((\"position\" >= 0) AND (\"position\" <= 2))"
  }
}
table "post_edits" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "post_id" {
    null = false
    type = uuid
  }
  column "previous_body" {
    null = true
    type = text
  }
  column "previous_content_warning" {
    null = true
    type = text
  }
  column "previous_media_manifest" {
    null = true
    type = jsonb
  }
  column "edited_by_actor_id" {
    null = true
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_post_edits_edited_by_actor_id" {
    columns     = [column.edited_by_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }
  foreign_key "fk_post_edits_post_id" {
    columns     = [column.post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_post_edits_created_at_id_post_id" {
    columns = [column.post_id, column.created_at, column.id]
  }
}
table "post_media" {
  schema = schema.public
  column "post_id" {
    null = false
    type = uuid
  }
  column "media_id" {
    null = false
    type = uuid
  }
  column "position" {
    null = false
    type = integer
  }
  primary_key {
    columns = [column.post_id, column.media_id]
  }
  foreign_key "fk_post_media_media_id" {
    columns     = [column.media_id]
    ref_columns = [table.media.column.id]
    on_update   = NO_ACTION
    on_delete   = RESTRICT
  }
  foreign_key "fk_post_media_post_id" {
    columns     = [column.post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_post_media_position_post_id" {
    unique  = true
    columns = [column.post_id, column.position]
  }
  check "chk_post_media_position" {
    expr = "((\"position\" >= 0) AND (\"position\" < 4))"
  }
}
table "post_tags" {
  schema = schema.public
  column "post_id" {
    null = false
    type = uuid
  }
  column "tag_id" {
    null = false
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.post_id, column.tag_id]
  }
  foreign_key "fk_post_tags_post_id" {
    columns     = [column.post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_post_tags_tag_id" {
    columns     = [column.tag_id]
    ref_columns = [table.tags.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_post_tags_created_at_post_id_tag_id" {
    columns = [column.tag_id, column.created_at, column.post_id]
  }
}
table "posts" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "author_actor_id" {
    null = false
    type = uuid
  }
  column "body" {
    null = true
    type = text
  }
  column "post_type" {
    null    = false
    type    = text
    default = "NOTE"
  }
  column "link_url" {
    null = true
    type = text
  }
  column "visibility" {
    null    = false
    type    = text
    default = "PUBLIC"
  }
  column "in_reply_to_id" {
    null = true
    type = uuid
  }
  column "root_post_id" {
    null = false
    type = uuid
  }
  column "canonical_uri" {
    null = true
    type = text
  }
  column "origin_server" {
    null = true
    type = text
  }
  column "is_local" {
    null    = false
    type    = boolean
    default = true
  }
  column "client_request_id" {
    null = true
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "edited_at" {
    null = true
    type = timestamptz
  }
  column "deleted_at" {
    null = true
    type = timestamptz
  }
  column "content_warning" {
    null = true
    type = text
  }
  column "removed_by_user_id" {
    null = true
    type = uuid
  }
  column "removal_reason" {
    null = true
    type = text
  }
  column "quoted_post_id" {
    null = true
    type = uuid
  }
  column "quote_policy" {
    null    = false
    type    = text
    default = "ANYONE"
  }
  column "community_id" {
    null = true
    type = uuid
  }
  column "tsv" {
    null = true
    type = tsvector
    as {
      expr = "to_tsvector('english'::regconfig, COALESCE(body, ''::text))"
      type = STORED
    }
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_posts_author_actor_id" {
    columns     = [column.author_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = RESTRICT
  }
  foreign_key "fk_posts_community_id" {
    columns     = [column.community_id]
    ref_columns = [table.communities.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }
  foreign_key "fk_posts_in_reply_to_id" {
    columns     = [column.in_reply_to_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = NO_ACTION
  }
  foreign_key "fk_posts_quoted_post_id" {
    columns     = [column.quoted_post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }
  foreign_key "fk_posts_root_post_id" {
    columns     = [column.root_post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = NO_ACTION
  }
  index "idx_posts_author_actor_id_client_request_id" {
    unique  = true
    columns = [column.author_actor_id, column.client_request_id]
  }
  index "idx_posts_author_actor_id_created_at_id" {
    on {
      column = column.author_actor_id
    }
    on {
      desc   = true
      column = column.created_at
    }
    on {
      desc   = true
      column = column.id
    }
  }
  index "idx_posts_body_fts" {
    type = GIN
    on {
      expr = "to_tsvector('simple'::regconfig, COALESCE(body, ''::text))"
    }
  }
  index "idx_posts_canonical_uri" {
    unique  = true
    columns = [column.canonical_uri]
  }
  index "idx_posts_community_id_created_at_id" {
    columns = [column.community_id, column.created_at, column.id]
  }
  index "idx_posts_created_at_id" {
    on {
      desc   = true
      column = column.created_at
    }
    on {
      desc   = true
      column = column.id
    }
  }
  index "idx_posts_created_at_id_in_reply_to_id" {
    columns = [column.in_reply_to_id, column.created_at, column.id]
  }
  index "idx_posts_created_at_id_root_post_id" {
    columns = [column.root_post_id, column.created_at, column.id]
  }
  index "idx_posts_tsv" {
    columns = [column.tsv]
    type    = GIN
  }
  check "chk_posts_link_url_required_for_link" {
    expr = "((post_type <> 'LINK'::text) OR (link_url IS NOT NULL))"
  }
  check "chk_posts_post_type" {
    expr = "(post_type = ANY (ARRAY['NOTE'::text, 'LINK'::text]))"
  }
  check "chk_posts_quote_policy" {
    expr = "(quote_policy = ANY (ARRAY['ANYONE'::text, 'FOLLOWERS'::text, 'NOBODY'::text]))"
  }
  check "chk_posts_visibility" {
    expr = "(visibility = ANY (ARRAY['PUBLIC'::text, 'UNLISTED'::text, 'FOLLOWERS'::text]))"
  }
}
table "quote_authorizations" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "quoted_post_id" {
    null = false
    type = uuid
  }
  column "quoting_post_id" {
    null = true
    type = uuid
  }
  column "quoter_actor_id" {
    null = false
    type = uuid
  }
  column "remote_stamp_uri" {
    null = true
    type = text
  }
  column "claimed_policy" {
    null = false
    type = text
  }
  column "state" {
    null = false
    type = text
  }
  column "verified_at" {
    null = true
    type = timestamptz
  }
  column "revoked_at" {
    null = true
    type = timestamptz
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_quote_authorizations_quoted_post_id" {
    columns     = [column.quoted_post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_quote_authorizations_quoter_actor_id" {
    columns     = [column.quoter_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_quote_authorizations_quoting_post_id" {
    columns     = [column.quoting_post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_quote_authorizations_quoted_post_id_quoting_post_id" {
    unique  = true
    columns = [column.quoting_post_id, column.quoted_post_id]
  }
  index "idx_quote_authorizations_quoted_post_id_state" {
    columns = [column.quoted_post_id, column.state]
  }
  check "chk_quote_authorizations_not_self" {
    expr = "((quoting_post_id IS NULL) OR (quoting_post_id <> quoted_post_id))"
  }
  check "chk_quote_authorizations_policy" {
    expr = "(claimed_policy = ANY (ARRAY['ANYONE'::text, 'FOLLOWERS'::text, 'NOBODY'::text]))"
  }
  check "chk_quote_authorizations_state" {
    expr = "(state = ANY (ARRAY['PENDING'::text, 'VERIFIED'::text, 'REVOKED'::text, 'REJECTED'::text]))"
  }
}
table "rate_limit_buckets" {
  schema = schema.public
  column "key" {
    null = false
    type = text
  }
  column "window_start" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "cost" {
    null    = false
    type    = integer
    default = 0
  }
  column "window_end" {
    null = false
    type = timestamptz
  }
  column "updated_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.key, column.window_start]
  }
  index "idx_rate_limit_buckets_window_end" {
    columns = [column.window_end]
  }
}
table "refresh_tokens" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "user_id" {
    null = false
    type = uuid
  }
  column "session_id" {
    null = false
    type = uuid
  }
  column "token_hash" {
    null = false
    type = text
  }
  column "expires_at" {
    null = false
    type = timestamptz
  }
  column "used_at" {
    null = true
    type = timestamptz
  }
  column "revoked_at" {
    null = true
    type = timestamptz
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "user_agent" {
    null = true
    type = text
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_refresh_tokens_user_id" {
    columns     = [column.user_id]
    ref_columns = [table.users.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_refresh_tokens_created_at_user_id" {
    columns = [column.user_id, column.created_at]
  }
  index "idx_refresh_tokens_session_id" {
    columns = [column.session_id]
  }
  index "idx_refresh_tokens_token_hash" {
    unique  = true
    columns = [column.token_hash]
  }
}
table "reports" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "reporter_actor_id" {
    null = false
    type = uuid
  }
  column "subject_type" {
    null = false
    type = text
  }
  column "subject_actor_id" {
    null = true
    type = uuid
  }
  column "subject_post_id" {
    null = true
    type = uuid
  }
  column "reason" {
    null = false
    type = text
  }
  column "details" {
    null = true
    type = text
  }
  column "status" {
    null    = false
    type    = text
    default = "OPEN"
  }
  column "moderator_note" {
    null = true
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "resolved_at" {
    null = true
    type = timestamptz
  }
  column "resolved_by_user_id" {
    null = true
    type = uuid
  }
  column "subject_guestbook_entry_id" {
    null = true
    type = uuid
  }
  column "subject_e2ee_logical_message_id" {
    null = true
    type = uuid
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_reports_reporter_actor_id" {
    columns     = [column.reporter_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_reports_resolved_by_user_id" {
    columns     = [column.resolved_by_user_id]
    ref_columns = [table.users.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }
  foreign_key "fk_reports_subject_actor_id" {
    columns     = [column.subject_actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_reports_subject_guestbook_entry_id" {
    columns     = [column.subject_guestbook_entry_id]
    ref_columns = [table.guestbook_entries.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_reports_subject_post_id" {
    columns     = [column.subject_post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_reports_created_at_status" {
    columns = [column.status, column.created_at]
  }
  index "idx_reports_subject_actor_id" {
    columns = [column.subject_actor_id]
  }
  index "idx_reports_subject_e2ee_logical_message_id" {
    columns = [column.subject_e2ee_logical_message_id]
  }
  index "idx_reports_subject_guestbook_entry_id" {
    columns = [column.subject_guestbook_entry_id]
  }
  index "idx_reports_subject_post_id" {
    columns = [column.subject_post_id]
  }
  check "chk_reports_reason" {
    expr = "(reason = ANY (ARRAY['SPAM'::text, 'HARASSMENT'::text, 'HATE_SPEECH'::text, 'ILLEGAL_CONTENT'::text, 'IMPERSONATION'::text, 'OTHER'::text]))"
  }
  check "chk_reports_status" {
    expr = "(status = ANY (ARRAY['OPEN'::text, 'REVIEWING'::text, 'RESOLVED'::text, 'DISMISSED'::text]))"
  }
  check "chk_reports_subject_matches_type" {
    expr = "(((subject_type = 'ACTOR'::text) AND (subject_actor_id IS NOT NULL) AND (subject_post_id IS NULL) AND (subject_guestbook_entry_id IS NULL) AND (subject_e2ee_logical_message_id IS NULL)) OR ((subject_type = 'POST'::text) AND (subject_post_id IS NOT NULL) AND (subject_actor_id IS NULL) AND (subject_guestbook_entry_id IS NULL) AND (subject_e2ee_logical_message_id IS NULL)) OR ((subject_type = 'GUESTBOOK_ENTRY'::text) AND (subject_guestbook_entry_id IS NOT NULL) AND (subject_actor_id IS NULL) AND (subject_post_id IS NULL) AND (subject_e2ee_logical_message_id IS NULL)) OR ((subject_type = 'E2EE_MESSAGE'::text) AND (subject_e2ee_logical_message_id IS NOT NULL) AND (subject_actor_id IS NULL) AND (subject_post_id IS NULL) AND (subject_guestbook_entry_id IS NULL)))"
  }
  check "chk_reports_subject_type" {
    expr = "(subject_type = ANY (ARRAY['ACTOR'::text, 'POST'::text, 'GUESTBOOK_ENTRY'::text, 'E2EE_MESSAGE'::text]))"
  }
}
table "reposts" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "post_id" {
    null = false
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "remote_activity_uri" {
    null = true
    type = text
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_reposts_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_reposts_post_id" {
    columns     = [column.post_id]
    ref_columns = [table.posts.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  index "idx_reposts_actor_id_created_at_id" {
    columns = [column.actor_id, column.created_at, column.id]
  }
  index "idx_reposts_actor_id_post_id" {
    unique  = true
    columns = [column.actor_id, column.post_id]
  }
  index "idx_reposts_created_at_id_post_id" {
    columns = [column.post_id, column.created_at, column.id]
  }
  index "idx_reposts_remote_activity_uri" {
    unique  = true
    columns = [column.remote_activity_uri]
  }
}
table "ssh_login_challenges" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "nonce" {
    null = false
    type = bytea
  }
  column "claimed_handle" {
    null = true
    type = text
  }
  column "expires_at" {
    null = false
    type = timestamptz
  }
  column "consumed_at" {
    null = true
    type = timestamptz
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "purpose" {
    null    = false
    type    = text
    default = "LOGIN"
  }
  column "bound_user_id" {
    null = true
    type = uuid
  }
  column "bound_fingerprint" {
    null = true
    type = text
  }
  primary_key {
    columns = [column.id]
  }
  index "idx_ssh_login_challenges_expires_at" {
    columns = [column.expires_at]
  }
  check "chk_ssh_login_challenges_purpose" {
    expr = "(purpose = ANY (ARRAY['LOGIN'::text, 'ENROLL'::text]))"
  }
}
table "tag_mutes" {
  schema = schema.public
  column "actor_id" {
    null = false
    type = uuid
  }
  column "tag_id" {
    null = false
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.actor_id, column.tag_id]
  }
  foreign_key "fk_tag_mutes_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
  foreign_key "fk_tag_mutes_tag_id" {
    columns     = [column.tag_id]
    ref_columns = [table.tags.column.id]
    on_update   = NO_ACTION
    on_delete   = CASCADE
  }
}
table "tags" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("public.uuid_generate_v4()")
  }
  column "name" {
    null = false
    type = text
  }
  column "display_name" {
    null = false
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  index "idx_tags_name" {
    unique  = true
    columns = [column.name]
  }
}
table "typeorm_metadata" {
  schema = schema.public
  column "type" {
    null = false
    type = character_varying(255)
  }
  column "database" {
    null = true
    type = character_varying(255)
  }
  column "schema" {
    null = true
    type = character_varying(255)
  }
  column "table" {
    null = true
    type = character_varying(255)
  }
  column "name" {
    null = true
    type = character_varying(255)
  }
  column "value" {
    null = true
    type = text
  }
}
table "users" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "recovery_email" {
    null = true
    type = text
  }
  column "recovery_email_normalized" {
    null = true
    type = text
  }
  column "email_verified_at" {
    null = true
    type = timestamptz
  }
  column "status" {
    null    = false
    type    = text
    default = "ACTIVE"
  }
  column "actor_id" {
    null = false
    type = uuid
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  column "deleted_at" {
    null = true
    type = timestamptz
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "fk_users_actor_id" {
    columns     = [column.actor_id]
    ref_columns = [table.actors.column.id]
    on_update   = NO_ACTION
    on_delete   = RESTRICT
  }
  index "idx_users_recovery_email_normalized" {
    unique  = true
    columns = [column.recovery_email_normalized]
  }
  check "chk_users_status" {
    expr = "(status = ANY (ARRAY['ACTIVE'::text, 'SUSPENDED'::text, 'DELETED'::text]))"
  }
  unique "uq_users_actor_id" {
    columns = [column.actor_id]
  }
}
table "webauthn_challenges" {
  schema = schema.public
  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }
  column "challenge" {
    null = false
    type = text
  }
  column "purpose" {
    null = false
    type = text
  }
  column "bound_user_id" {
    null = true
    type = uuid
  }
  column "expires_at" {
    null = false
    type = timestamptz
  }
  column "consumed_at" {
    null = true
    type = timestamptz
  }
  column "created_at" {
    null    = false
    type    = timestamptz
    default = sql("now()")
  }
  primary_key {
    columns = [column.id]
  }
  index "idx_webauthn_challenges_challenge" {
    unique  = true
    columns = [column.challenge]
  }
  index "idx_webauthn_challenges_expires_at" {
    columns = [column.expires_at]
  }
  check "chk_webauthn_challenges_purpose" {
    expr = "(purpose = ANY (ARRAY['REGISTRATION'::text, 'LOGIN'::text]))"
  }
}
schema "public" {
  comment = "standard public schema"
}
