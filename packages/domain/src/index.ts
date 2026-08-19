export {
  ALLOWED_LINK_SCHEMES,
  GUESTBOOK_ENTRY_MAX_CHARS,
  PAGE_DOCUMENT_MAX_BYTES,
  PAGE_LINK_HREF_MAX_CHARS,
  PAGE_LINK_LABEL_MAX_CHARS,
  PAGE_MAX_BLOCK_TEXT_BYTES,
  PAGE_MAX_BLOCKS_PER_PAGE,
  PAGE_MAX_GALLERY_ITEMS,
  PAGE_MAX_LINKS_PER_BLOCK,
  PAGE_MAX_SUBPAGES,
  PAGE_MAX_TOP_EIGHT,
  PAGE_SHORT_TEXT_MAX_CHARS,
  PAGE_SLUG_MAX_CHARS,
  PAGE_SLUG_PATTERN,
  PAGE_THEME_FIELD_MAX_CHARS,
  PAGE_TITLE_MAX_CHARS,
} from './limits.js';
export {
  COMMUNITY_NAME_MAX_CHARS,
  COMMUNITY_NAME_MIN_CHARS,
  COMMUNITY_NAME_PATTERN,
  DM_GROUP_MAX,
  MAX_ACTOR_FLAIR_BYTES,
  MAX_COMMUNITY_DESCRIPTION_CHARS,
  MAX_COMMUNITY_DISPLAY_NAME_CHARS,
  MAX_COMMUNITY_MODERATORS,
  MAX_COMMUNITY_RULES_BYTES,
  MAX_DM_BODY_CHARS,
  MAX_PINNED_POSTS,
  MAX_POST_CHARS,
  MAX_POST_CHARS_NODE_CEILING,
  MAX_POST_EDITS_PER_POST,
  MAX_QUOTED_POST_NESTING_RENDERED,
  MAX_TAG_NAME_CHARS,
  MAX_TAGS_PER_POST,
  MESSAGE_REQUEST_MAX_MESSAGES,
  MESSAGE_REQUEST_MAX_PENDING_PER_PAIR,
  RATE_LIMITS,
} from './limits.js';
export {
  ACCOUNT_DELETION_GRACE_PERIOD_DAYS_DEFAULT,
  ACCOUNT_EXPORT_EXPIRES_AFTER_DAYS,
  ACCOUNT_EXPORT_MAX_READY_ARCHIVES,
  APPEAL_WINDOW_DAYS_DEFAULT,
  MAX_APPEAL_STATEMENT_CHARS,
  MAX_FILTER_LIST_DESCRIPTION_CHARS,
  MAX_FILTER_LIST_DISPLAY_NAME_CHARS,
  MAX_FILTER_LIST_ENTRIES,
  MAX_FILTER_LIST_EXCEPTIONS_PER_LIST,
  MAX_FILTER_LIST_NAME_CHARS,
  MAX_FILTER_LIST_SUBSCRIPTIONS,
  MAX_FILTER_LISTS_PUBLISHED_PER_ACTOR,
  MAX_FILTER_NAME_CHARS,
  MAX_FILTER_TERM_VALUE_CHARS,
  MAX_FILTER_TERMS_PER_FILTER,
  MAX_FILTERS_PER_ACTOR,
  MAX_LABELER_SUBSCRIPTIONS_PER_ACTOR,
} from './limits.js';

export { containsUnsafeBytes, sanitizeText, utf8ByteLength } from './sanitize.js';
export type { SanitizeTextOptions } from './sanitize.js';

export { BLOCK_SCHEMAS, BLOCK_TYPES, lenientPageBlockSchema, pageBlockSchema } from './blocks.js';
export type { PageBlock, RenderablePageBlock, UnknownPageBlock } from './blocks.js';

export {
  buildSshChallengeBlob,
  SSH_ENROLL_DOMAIN_SEPARATOR,
  SSH_LOGIN_DOMAIN_SEPARATOR,
} from './ssh/challenge-blob.js';
export type { SshChallengeBlobInput } from './ssh/challenge-blob.js';

export { encodeSshString, encodeSshStrings, SshReader, SshWireError } from './ssh/wire.js';

export {
  CURRENT_PAGE_SCHEMA_VERSION,
  PAGE_BORDER_STYLES,
  parsePageForRender,
  parsePageLenient,
  parsePageStrict,
  serializePage,
  isPageValidationError,
  PageValidationError,
} from './page.js';
export type {
  PageBorderStyle,
  PageTheme,
  PatchesPage,
  PatchesPageView,
  PatchesSubPage,
  PatchesSubPageView,
} from './page.js';

// The E2EE DM contract (ADR 0020, P13-001). One barrel, re-exported wholesale: the
// authoritative export list lives in `./e2ee/index.ts` so the surface is described once.
export * from './e2ee/index.js';
