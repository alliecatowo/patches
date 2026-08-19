/**
 * `@patches/markup` — the shared post-body grammar (spec §22, §181, §189).
 *
 * `parseMarkup` turns markdown/the HTML subset/plain text into one sanitized AST
 * (`BlockNode[]`); `apps/tui` layers terminal-cell word-wrap on top of it, `apps/web`
 * renders it straight to React. See `markup.ts`'s module doc for the full contract.
 */
export {
  decodeEntities,
  extractMentions,
  looksLikeHtml,
  parseInline,
  parseMarkup,
  safeHref,
  type BlockNode,
  type InlineNode,
  type InlineRole,
} from './markup.js';
export { sanitizeForTerminal } from './sanitize.js';
