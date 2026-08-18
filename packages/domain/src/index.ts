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
