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
