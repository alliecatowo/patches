import { sanitizeForTerminal } from './sanitize.js';

/**
 * The one markup grammar Patches understands in a post body.
 *
 * A body may arrive as markdown (what people type) or as a small subset of HTML
 * (what federated and imported content carries). Both are funnelled through the same
 * pipeline — sanitize -> parse -> one AST — so a body can never render one way in one
 * client and another way in another.
 *
 * This module produces data only: no terminal escapes, no DOM, no React/Ink. The TUI
 * (`apps/tui/src/format/markup.ts`) re-exports this parser and layers terminal-cell
 * word-wrapping on top of the resulting AST; the web client (`apps/web/src/components/
 * RichBody.tsx`) renders the same AST straight to React elements via CSS flow layout.
 * Neither client is allowed to write a second grammar (see `docs/architecture/tui.md`).
 *
 * Two invariants hold everywhere:
 *
 * 1. Control characters and escape sequences never survive parsing. `sanitizeForTerminal`
 *    runs first, on the raw source, so no later stage can be handed a cursor move or an
 *    APC payload smuggled inside an attribute or a code span.
 * 2. Only http/https/mailto links are links. Anything else (`javascript:`, `data:`)
 *    renders as ordinary text, never as something activatable.
 */

// --- AST ---------------------------------------------------------------------

export type InlineRole = 'text' | 'strong' | 'emphasis' | 'code' | 'link' | 'mention' | 'tag';

export interface InlineNode {
  role: InlineRole;
  text: string;
  /** Present only on `link`. Always an allow-listed absolute URL. */
  href?: string;
  /** Marker(s) plain mode reproduces around the text, e.g. `**` or a backtick. */
  marker?: string;
}

export type BlockNode =
  /**
   * A paragraph holds *hard-broken* lines rather than one reflowed run. In a post body
   * a typed newline is a line break the author meant — markdown's "soft break becomes a
   * space" rule would silently reflow every multi-line post into a wall of text.
   */
  | { kind: 'paragraph'; lines: InlineNode[][] }
  | { kind: 'heading'; level: number; inlines: InlineNode[] }
  | { kind: 'quote'; blocks: BlockNode[] }
  | { kind: 'list'; ordered: boolean; items: BlockNode[][] }
  | { kind: 'code'; lines: string[] };

// --- sanitation --------------------------------------------------------------

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodes the handful of entities the HTML subset can carry. Numeric references are
 * decoded then re-sanitized, so `&#27;` cannot reintroduce an escape character. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/gu, (whole, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const digits = isHex ? body.slice(2) : body.slice(1);
      const code = Number.parseInt(digits, isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      return sanitizeForTerminal(String.fromCodePoint(code));
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const SAFE_SCHEMES = ['http://', 'https://', 'mailto:'];

/** A URL is a link only if it is absolute and uses a scheme that cannot execute. */
export function safeHref(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const lowered = trimmed.toLowerCase();
  if (!SAFE_SCHEMES.some((scheme) => lowered.startsWith(scheme))) return undefined;
  // A control character can't reach here (the source was sanitized), but whitespace
  // inside a URL would let one visual "link" span two apparent targets.
  if (/\s/u.test(trimmed)) return undefined;
  return trimmed;
}

// --- inline parsing ----------------------------------------------------------

/**
 * `@handle` — the same grammar the server extracts mentions with
 * (`apps/server/src/modules/posts/post.service.ts`'s `MENTION_PATTERN`, spec §22:
 * ASCII letters/digits/underscore, 3–30). Kept in step by hand; a highlight that
 * disagrees with what actually notified someone is worse than no highlight.
 */
const MENTION_PATTERN = /@([a-zA-Z0-9_]{3,30})\b/gu;

/** `#tag` — §181's tag grammar, conservatively: letters/digits/underscore, never
 * all-digits (so `#2026` is not a tag), 1–64. */
const TAG_PATTERN = /#([a-zA-Z0-9_]{1,64})\b/gu;

/** Bare URLs become links so a pasted address is still activatable. */
const AUTOLINK_PATTERN = /https?:\/\/[^\s<>()]+/gu;

interface Mark {
  start: number;
  end: number;
  node: InlineNode;
}

function pushMark(marks: Mark[], mark: Mark): void {
  // First match wins on overlap: an `@handle` inside a URL is part of the URL.
  if (marks.some((existing) => mark.start < existing.end && existing.start < mark.end)) return;
  marks.push(mark);
}

/**
 * Splits already-sanitized text into styled runs: emphasis, code spans, links,
 * mentions and tags. Never un-escapes anything — it only decides what each run *is*.
 */
export function parseInline(text: string): InlineNode[] {
  const marks: Mark[] = [];

  // Each pattern scans a copy in which already-claimed spans are blanked out with
  // newlines (which every pattern below excludes). Without it a later pattern both
  // matches inside an earlier one and, worse, resumes its scan *after* that false
  // match: `**bold** and *italic*` would silently lose the italic run.
  let masked = text;
  const claim = (start: number, end: number): void => {
    masked = masked.slice(0, start) + '\n'.repeat(end - start) + masked.slice(end);
  };

  const collect = (
    pattern: RegExp,
    build: (match: RegExpMatchArray) => InlineNode | undefined,
  ): void => {
    const claimed: { start: number; end: number }[] = [];
    for (const match of masked.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const node = build(match);
      if (node === undefined) continue;
      const start = match.index;
      const end = start + match[0].length;
      pushMark(marks, { start, end, node });
      claimed.push({ start, end });
    }
    for (const span of claimed) claim(span.start, span.end);
  };

  // Code spans first: nothing inside a code span is markup.
  collect(/`([^`\n]+)`/gu, (match) => ({ role: 'code', text: match[1] ?? '', marker: '`' }));
  collect(/\[([^\]\n]+)\]\(([^)\s]+)\)/gu, (match) => {
    const href = safeHref(match[2] ?? '');
    if (href === undefined) return { role: 'text', text: match[0] };
    return { role: 'link', text: match[1] ?? '', href };
  });
  collect(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/gu, (match) => ({
    role: 'strong',
    text: match[1] ?? match[2] ?? '',
    marker: '**',
  }));
  collect(/\*([^*\n]+)\*|_([^_\n]+)_/gu, (match) => ({
    role: 'emphasis',
    text: match[1] ?? match[2] ?? '',
    marker: '*',
  }));
  collect(AUTOLINK_PATTERN, (match) => {
    const href = safeHref(match[0]);
    if (href === undefined) return undefined;
    return { role: 'link', text: match[0], href };
  });
  collect(MENTION_PATTERN, (match) => ({ role: 'mention', text: match[0] }));
  collect(TAG_PATTERN, (match) => {
    if (/^\d+$/u.test(match[1] ?? '')) return undefined;
    return { role: 'tag', text: match[0] };
  });

  marks.sort((a, b) => a.start - b.start);

  const nodes: InlineNode[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) nodes.push({ role: 'text', text: text.slice(cursor, mark.start) });
    nodes.push(mark.node);
    cursor = mark.end;
  }
  if (cursor < text.length) nodes.push({ role: 'text', text: text.slice(cursor) });
  return nodes;
}

/** Every distinct `@handle` in a body, lowercased, in first-appearance order. */
export function extractMentions(text: string): string[] {
  const handles: string[] = [];
  for (const match of sanitizeForTerminal(text).matchAll(MENTION_PATTERN)) {
    const handle = (match[1] ?? '').toLowerCase();
    if (handle !== '' && !handles.includes(handle)) handles.push(handle);
  }
  return handles;
}

// --- HTML subset -------------------------------------------------------------

const INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'code', 'a']);
const BLOCK_TAGS = new Set(['p', 'ul', 'ol', 'li', 'blockquote', 'br']);
/** Tags whose *content* is dropped, not just their markup. */
const OPAQUE_TAGS = new Set(['script', 'style']);

const TAG_PATTERN_HTML = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/gu;

/** True when the source carries at least one tag from the supported subset. */
export function looksLikeHtml(source: string): boolean {
  for (const match of source.matchAll(TAG_PATTERN_HTML)) {
    const name = (match[1] ?? '').toLowerCase();
    if (INLINE_TAGS.has(name) || BLOCK_TAGS.has(name)) return true;
  }
  return false;
}

// Cache regexes by attribute name to avoid repeated compilation and object allocations during HTML parsing.
const ATTRIBUTE_REGEX_CACHE = new Map<string, RegExp>();

function getAttributeRegExp(name: string): RegExp {
  const key = name.toLowerCase();
  let pattern = ATTRIBUTE_REGEX_CACHE.get(key);
  if (pattern === undefined) {
    pattern = new RegExp(`${key}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'iu');
    ATTRIBUTE_REGEX_CACHE.set(key, pattern);
  }
  return pattern;
}

function attributeValue(attributes: string, name: string): string | undefined {
  const pattern = getAttributeRegExp(name);
  const match = pattern.exec(attributes);
  if (match === null) return undefined;
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
}

interface HtmlToken {
  kind: 'open' | 'close' | 'text';
  name?: string;
  attributes?: string;
  text?: string;
}

function tokenizeHtml(source: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let cursor = 0;
  let skipUntil: string | undefined;

  for (const match of source.matchAll(TAG_PATTERN_HTML)) {
    const index = match.index;
    if (index === undefined) continue;
    const name = (match[1] ?? '').toLowerCase();
    const closing = match[0].startsWith('</');

    if (skipUntil !== undefined) {
      // Inside <script>/<style>: everything up to the matching close is discarded.
      if (closing && name === skipUntil) skipUntil = undefined;
      cursor = index + match[0].length;
      continue;
    }
    if (index > cursor) tokens.push({ kind: 'text', text: source.slice(cursor, index) });
    cursor = index + match[0].length;

    if (OPAQUE_TAGS.has(name)) {
      if (!closing) skipUntil = name;
      continue;
    }
    // An unsupported tag is erased, but the text it wrapped is kept.
    if (!INLINE_TAGS.has(name) && !BLOCK_TAGS.has(name)) continue;
    tokens.push(
      closing ? { kind: 'close', name } : { kind: 'open', name, attributes: match[2] ?? '' },
    );
  }
  if (skipUntil === undefined && cursor < source.length) {
    tokens.push({ kind: 'text', text: source.slice(cursor) });
  }
  return tokens;
}

/** Collapses HTML's insignificant whitespace, which is never meaningful in a body. */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ');
}

interface HtmlFrame {
  blocks: BlockNode[];
  /** Completed hard-broken lines of the paragraph currently being built. */
  lines: InlineNode[][];
  inlines: InlineNode[];
  items: BlockNode[][];
  tag: string;
}

function parseHtmlBlocks(source: string): BlockNode[] {
  const root: HtmlFrame = { blocks: [], lines: [], inlines: [], items: [], tag: 'root' };
  const stack: HtmlFrame[] = [root];
  const inlineRoles: { role: InlineRole; marker?: string }[] = [];
  let href: string | undefined;

  const top = (): HtmlFrame => stack[stack.length - 1] ?? root;

  /** Ends the current line without ending the paragraph (`<br>`). */
  const breakLine = (frame: HtmlFrame): void => {
    if (frame.inlines.length === 0) return;
    frame.lines.push(frame.inlines);
    frame.inlines = [];
  };
  /** Ends the paragraph (`</p>`, a block boundary, end of input). */
  const flushInlines = (frame: HtmlFrame): void => {
    breakLine(frame);
    if (frame.lines.length === 0) return;
    frame.blocks.push({ kind: 'paragraph', lines: frame.lines });
    frame.lines = [];
  };

  const appendText = (raw: string): void => {
    const decoded = collapseWhitespace(decodeEntities(raw));
    if (decoded.trim() === '' && top().inlines.length === 0) return;
    const active = inlineRoles.at(-1);
    if (active === undefined) {
      // Plain text inside HTML still gets mentions, tags and autolinks.
      top().inlines.push(...parseInline(decoded));
      return;
    }
    const node: InlineNode = { role: active.role, text: decoded };
    if (active.marker !== undefined) node.marker = active.marker;
    if (active.role === 'link' && href !== undefined) node.href = href;
    top().inlines.push(node);
  };

  for (const token of tokenizeHtml(source)) {
    if (token.kind === 'text') {
      appendText(token.text ?? '');
      continue;
    }
    const name = token.name ?? '';

    if (token.kind === 'open') {
      switch (name) {
        case 'b':
        case 'strong':
          inlineRoles.push({ role: 'strong', marker: '**' });
          break;
        case 'i':
        case 'em':
          inlineRoles.push({ role: 'emphasis', marker: '*' });
          break;
        case 'code':
          inlineRoles.push({ role: 'code', marker: '`' });
          break;
        case 'a': {
          href = safeHref(attributeValue(token.attributes ?? '', 'href') ?? '');
          // A link with no safe target is still readable text, just not a link.
          inlineRoles.push(href === undefined ? { role: 'text' } : { role: 'link' });
          break;
        }
        case 'br':
          breakLine(top());
          break;
        case 'p':
          flushInlines(top());
          break;
        case 'blockquote':
        case 'ul':
        case 'ol': {
          flushInlines(top());
          stack.push({ blocks: [], lines: [], inlines: [], items: [], tag: name });
          break;
        }
        case 'li': {
          const frame = top();
          if (frame.tag === 'ul' || frame.tag === 'ol') flushInlines(frame);
          stack.push({ blocks: [], lines: [], inlines: [], items: [], tag: 'li' });
          break;
        }
        default:
          break;
      }
      continue;
    }

    switch (name) {
      case 'b':
      case 'strong':
      case 'i':
      case 'em':
      case 'code':
        inlineRoles.pop();
        break;
      case 'a':
        inlineRoles.pop();
        href = undefined;
        break;
      case 'p':
        flushInlines(top());
        break;
      case 'li': {
        const frame = stack.pop();
        if (frame === undefined) break;
        flushInlines(frame);
        const parent = top();
        if (frame.blocks.length > 0) parent.items.push(frame.blocks);
        break;
      }
      case 'ul':
      case 'ol':
      case 'blockquote': {
        const frame = stack.pop();
        if (frame === undefined) break;
        flushInlines(frame);
        const parent = top();
        if (name === 'blockquote') {
          if (frame.blocks.length > 0) parent.blocks.push({ kind: 'quote', blocks: frame.blocks });
        } else if (frame.items.length > 0) {
          parent.blocks.push({ kind: 'list', ordered: name === 'ol', items: frame.items });
        }
        break;
      }
      default:
        break;
    }
  }

  while (stack.length > 1) {
    const frame = stack.pop();
    if (frame === undefined) break;
    flushInlines(frame);
    top().blocks.push(...frame.blocks);
  }
  flushInlines(root);
  return root.blocks;
}

// --- markdown ----------------------------------------------------------------

const HEADING = /^(#{1,6})\s+(.*)$/u;
const BULLET = /^\s*[-*+]\s+(.*)$/u;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/u;
const QUOTE = /^\s*>\s?(.*)$/u;
const FENCE = /^\s*```/u;

function parseMarkdownBlocks(source: string): BlockNode[] {
  const lines = source.split('\n');
  const blocks: BlockNode[] = [];
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', lines: paragraph.map((line) => parseInline(line)) });
    paragraph = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (FENCE.test(line)) {
      flushParagraph();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? '')) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      index += 1; // closing fence (or end of input)
      blocks.push({ kind: 'code', lines: body });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      flushParagraph();
      blocks.push({
        kind: 'heading',
        level: (heading[1] ?? '#').length,
        inlines: parseInline(heading[2] ?? ''),
      });
      index += 1;
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote !== null) {
      flushParagraph();
      const quoted: string[] = [];
      while (index < lines.length) {
        const inner = QUOTE.exec(lines[index] ?? '');
        if (inner === null) break;
        quoted.push(inner[1] ?? '');
        index += 1;
      }
      blocks.push({ kind: 'quote', blocks: parseMarkdownBlocks(quoted.join('\n')) });
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      flushParagraph();
      const ordered = ORDERED.test(line);
      const items: BlockNode[][] = [];
      while (index < lines.length) {
        const current = lines[index] ?? '';
        const match = ordered ? ORDERED.exec(current) : BULLET.exec(current);
        if (match === null) break;
        items.push([{ kind: 'paragraph', lines: [parseInline(match[1] ?? '')] }]);
        index += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return blocks;
}

/**
 * Parses a post body — markdown, the HTML subset, or plain text — into one AST.
 *
 * Sanitisation happens here, once, on the raw source. Every downstream consumer can
 * treat the AST as safe text.
 */
export function parseMarkup(source: string): BlockNode[] {
  const safe = sanitizeForTerminal(source);
  if (safe.trim() === '') return [];
  const blocks = looksLikeHtml(safe) ? parseHtmlBlocks(safe) : parseMarkdownBlocks(safe);
  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', lines: [parseInline(safe)] }];
}
