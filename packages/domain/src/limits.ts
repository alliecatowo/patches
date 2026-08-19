/**
 * Patches Pages limits (`INITIAL_VISION.md` §171, `docs/architecture/pages.md` §2), enforced
 * server-side and published via `NodeService.GetNodeInfo`. Single source of truth shared by
 * the server, the TUI editor, and any future web editor (spec §171 — "validation lives in
 * packages/domain so ... clients ... share one definition").
 */

/** Serialized document ceiling — 64 KiB. */
export const PAGE_DOCUMENT_MAX_BYTES = 64 * 1024;

/** Sub-pages per actor. */
export const PAGE_MAX_SUBPAGES = 32;

/** Blocks per sub-page. */
export const PAGE_MAX_BLOCKS_PER_PAGE = 128;

/** Text per block — 8 KiB, measured in UTF-8 bytes (matches the document ceiling's unit). */
export const PAGE_MAX_BLOCK_TEXT_BYTES = 8 * 1024;

/** Guestbook entry body, in characters (§171 — "≤ 500 characters", a character bound rather
 * than a byte bound, unlike the block text limits above). */
export const GUESTBOOK_ENTRY_MAX_CHARS = 500;

/** Bounds on structural fields that aren't in §171's headline list but still need a ceiling
 * to keep a single document from being a denial-of-service vector. */
export const PAGE_SLUG_MAX_CHARS = 64;
export const PAGE_TITLE_MAX_CHARS = 200;
export const PAGE_LINK_LABEL_MAX_CHARS = 200;
export const PAGE_LINK_HREF_MAX_CHARS = 2048;
export const PAGE_MAX_LINKS_PER_BLOCK = 40;
export const PAGE_MAX_TOP_EIGHT = 8;
export const PAGE_MAX_GALLERY_ITEMS = 20;
export const PAGE_SHORT_TEXT_MAX_CHARS = 300;
export const PAGE_THEME_FIELD_MAX_CHARS = 32;

/** Link `href` scheme allowlist (`INITIAL_VISION.md` §104, amended §172): exactly `http`/
 * `https`. `javascript:`, `data:`, `file:`, and everything else are rejected — the spec does
 * not list any scheme beyond http(s) for Pages, so none is added speculatively. */
export const ALLOWED_LINK_SCHEMES = ['http:', 'https:'] as const;

/** Slug pattern: lowercase ASCII, digits, hyphens — same shape as an actor handle segment,
 * URL-safe with no percent-encoding surprises in `patches visit @actor/slug`. */
export const PAGE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * Amendment B size limits (`INITIAL_VISION.md` §188), published via `NodeService.GetNodeInfo`
 * where a client needs one to render honestly. Enforced in protobuf/API validation, service
 * validation, and a database constraint where practical (§188's preamble) — this module is
 * the single source of truth all three read from.
 */

/** Tag name: max characters, and must contain at least one letter (enforced separately, not
 * by a numeric limit). */
export const MAX_TAG_NAME_CHARS = 30;

/** Tags per post. */
export const MAX_TAGS_PER_POST = 10;

export const COMMUNITY_NAME_MIN_CHARS = 3;
export const COMMUNITY_NAME_MAX_CHARS = 32;
/** `[a-z0-9_]`, `COMMUNITY_NAME_MIN_CHARS`-`COMMUNITY_NAME_MAX_CHARS` characters — mirrors the
 * `chk_communities_name` database constraint. */
export const COMMUNITY_NAME_PATTERN = /^[a-z0-9_]{3,32}$/;

export const MAX_COMMUNITY_DISPLAY_NAME_CHARS = 80;
export const MAX_COMMUNITY_DESCRIPTION_CHARS = 500;
/** 4 KiB. */
export const MAX_COMMUNITY_RULES_BYTES = 4 * 1024;
export const MAX_COMMUNITY_MODERATORS = 16;

/** DM body, in characters. */
export const MAX_DM_BODY_CHARS = 2_000;

/** Members in a group conversation, including the creator. */
export const DM_GROUP_MAX = 8;

/** At most one pending message request per (sender, recipient) pair, and at most one message
 * on it — enforced by `message_requests`' partial unique index (`packages/database`). */
export const MESSAGE_REQUEST_MAX_PENDING_PER_PAIR = 1;
export const MESSAGE_REQUEST_MAX_MESSAGES = 1;

/** Actor flair document, serialized. 1 KiB. */
export const MAX_ACTOR_FLAIR_BYTES = 1 * 1024;

/** Pinned posts per actor — `pinned_posts.position` is 0 to this minus 1. */
export const MAX_PINNED_POSTS = 3;

/** Levels of quoted-post nesting actually rendered — a quote of a quote still stores the
 * chain, but only one level is ever shown. */
export const MAX_QUOTED_POST_NESTING_RENDERED = 1;

/** Edits kept per post. */
export const MAX_POST_EDITS_PER_POST = 20;

/** Post body, in characters — the platform default. A node may publish up to
 * {@link MAX_POST_CHARS_NODE_CEILING} instead (§188). */
export const MAX_POST_CHARS = 5_000;

/** The absolute ceiling a node may configure `MAX_POST_CHARS` up to. */
export const MAX_POST_CHARS_NODE_CEILING = 10_000;

/**
 * Amendment B rate limits (`INITIAL_VISION.md` §188, §102) — database-backed for the
 * abuse-sensitive ones, per actor and per peer. Starting values; may evolve (§58) — what
 * MUST NOT happen is a new write path shipping with no limit at all.
 */
export const RATE_LIMITS = Object.freeze({
  /** Reposts/unreposts, per actor, per hour. */
  repostPerHour: 60,
  /** Quotes, per actor, per hour. */
  quotePerHour: 30,
  /** Post edits, per actor, per hour. */
  postEditPerHour: 30,
  /** Community creations, per actor, per day. Also node-capability gated
   * (`NodeService.GetNodeInfo`'s `social_capabilities.can_create_community`). */
  communityCreatePerDay: 2,
  /** Community joins, per actor, per day. */
  communityJoinPerDay: 50,
  /** Community invites sent, per actor, per day. */
  communityInvitePerDay: 20,
  /** Community invites sent, per actor, per community, per hour. */
  communityInvitePerCommunityPerHour: 5,
  /** DMs sent, per actor, per minute. */
  dmSendPerMinute: 20,
  /** DMs sent, per actor, per hour. */
  dmSendPerHour: 300,
  /** Message requests sent, per actor, per hour. */
  messageRequestPerHour: 5,
  /** Message requests sent, per actor, per day. */
  messageRequestPerDay: 20,
  /** Tag mutes, total per actor (not a rate — a ceiling on the mute list itself). */
  tagMuteTotal: 100,
} as const);
