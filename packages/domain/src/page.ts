import { z } from 'zod';

import {
  lenientPageBlockSchema,
  pageBlockSchema,
  shortText,
  type RenderablePageBlock,
} from './blocks.js';
import { isPageValidationError, PageValidationError } from './errors.js';
import {
  PAGE_DOCUMENT_MAX_BYTES,
  PAGE_MAX_BLOCKS_PER_PAGE,
  PAGE_MAX_SUBPAGES,
  PAGE_SLUG_MAX_CHARS,
  PAGE_SLUG_PATTERN,
  PAGE_THEME_FIELD_MAX_CHARS,
  PAGE_TITLE_MAX_CHARS,
} from './limits.js';
import { utf8ByteLength } from './sanitize.js';

/**
 * The `PatchesPage` document (`INITIAL_VISION.md` §171, `docs/architecture/pages.md` §2).
 * Only schema version 1 exists — a document declaring any other version is rejected outright
 * rather than guessed at (§171: "validate strictly against its declared version").
 */
export const CURRENT_PAGE_SCHEMA_VERSION = 1;

export const PAGE_BORDER_STYLES = ['single', 'double', 'round', 'ascii', 'none'] as const;
export type PageBorderStyle = (typeof PAGE_BORDER_STYLES)[number];

const themeSchema = z
  .object({
    accent: shortText(PAGE_THEME_FIELD_MAX_CHARS).optional(),
    background: shortText(PAGE_THEME_FIELD_MAX_CHARS).optional(),
    foreground: shortText(PAGE_THEME_FIELD_MAX_CHARS).optional(),
    border: z.enum(PAGE_BORDER_STYLES).optional(),
    avatarStyle: shortText(PAGE_THEME_FIELD_MAX_CHARS).optional(),
  })
  .strict();

export type PageTheme = z.infer<typeof themeSchema>;

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(PAGE_SLUG_MAX_CHARS)
  .regex(PAGE_SLUG_PATTERN, 'slug must be lowercase letters, digits, and hyphens');

const subPageSchema = z
  .object({
    slug: slugSchema,
    title: shortText(PAGE_TITLE_MAX_CHARS),
    blocks: z.array(pageBlockSchema).max(PAGE_MAX_BLOCKS_PER_PAGE),
  })
  .strict();

export type PatchesSubPage = z.infer<typeof subPageSchema>;

const pageDocumentShape = z
  .object({
    version: z.literal(CURRENT_PAGE_SCHEMA_VERSION),
    theme: themeSchema.optional(),
    pages: z.array(subPageSchema).min(1).max(PAGE_MAX_SUBPAGES),
  })
  .strict();

export type PatchesPage = z.infer<typeof pageDocumentShape>;

/** Duplicate sub-page slugs and the overall 64 KiB serialized-document ceiling can only be
 * checked once the whole structure is known, so they're a `superRefine` over the base shape
 * rather than a per-field `.max()`. */
const pageDocumentSchema = pageDocumentShape.superRefine((doc, ctx) => {
  const seenSlugs = new Set<string>();
  doc.pages.forEach((subPage, index) => {
    if (seenSlugs.has(subPage.slug)) {
      ctx.addIssue({
        code: 'custom',
        path: ['pages', index, 'slug'],
        message: `duplicate sub-page slug "${subPage.slug}"`,
      });
    }
    seenSlugs.add(subPage.slug);
  });

  const bytes = utf8ByteLength(JSON.stringify(doc));
  if (bytes > PAGE_DOCUMENT_MAX_BYTES) {
    ctx.addIssue({
      code: 'custom',
      path: [],
      message: `document is ${String(bytes)} bytes, exceeding the ${String(PAGE_DOCUMENT_MAX_BYTES)} byte limit`,
    });
  }
});

function formatZodError(error: z.ZodError): string {
  const details = error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path.length === 0 ? issue.message : `${path}: ${issue.message}`;
    })
    .join('; ');
  return details.length === 0 ? 'Invalid page document.' : details;
}

/**
 * Strict, write-time parse (§171). Rejects unknown block types, unknown fields at every
 * level, and a document over any of §171's limits. Throws {@link PageValidationError} — the
 * server maps this to `AppError.validation`.
 */
export function parsePageStrict(input: unknown): PatchesPage {
  const result = pageDocumentSchema.safeParse(input);
  if (!result.success) {
    throw new PageValidationError(formatZodError(result.error));
  }
  return result.data;
}

/** Canonical JSON serialization of a validated document — the exact bytes `page_revisions
 * .document`/the wire `GetPageResponse.document` should carry, so re-serializing a strictly
 * parsed document never drifts from what was validated. */
export function serializePage(doc: PatchesPage): string {
  return JSON.stringify(doc);
}

export { isPageValidationError, PageValidationError };

// ---------------------------------------------------------------------------------------
// Lenient (render-time) parsing (§171: "a renderer MUST ignore block types it does not
// support, rendering a visible placeholder rather than failing the page").
// ---------------------------------------------------------------------------------------

export interface PatchesPageView {
  version: number;
  theme: PageTheme | undefined;
  pages: PatchesSubPageView[];
}

export interface PatchesSubPageView {
  slug: string;
  title: string;
  blocks: RenderablePageBlock[];
}

/** Best-effort field read: returns `undefined` rather than throwing for anything that isn't
 * the shape lenient parsing expects — the caller decides what to render given `undefined`. */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseBlockLenient(raw: unknown): RenderablePageBlock {
  const result = lenientPageBlockSchema.safeParse(raw);
  if (result.success) return result.data;

  const originalType =
    typeof raw === 'object' && raw !== null && 'type' in raw && typeof raw.type === 'string'
      ? raw.type
      : 'unknown';
  return { type: 'Unknown', originalType };
}

function parseSubPageLenient(raw: unknown): PatchesSubPageView | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  const slug = readString(record.slug);
  if (slug === undefined) return undefined;

  const rawBlocks = Array.isArray(record.blocks) ? record.blocks : [];
  return {
    slug: slug.trim().toLowerCase().slice(0, PAGE_SLUG_MAX_CHARS),
    title: (readString(record.title) ?? '').slice(0, PAGE_TITLE_MAX_CHARS),
    blocks: rawBlocks.slice(0, PAGE_MAX_BLOCKS_PER_PAGE).map(parseBlockLenient),
  };
}

function parseThemeLenient(raw: unknown): PageTheme | undefined {
  const result = themeSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

/**
 * Tolerant, render-time parse. Never throws for an unknown block type or an unrecognized
 * theme/extra field — those degrade to placeholders or are dropped, per §171's "never fail
 * the page" rule. Still throws {@link PageValidationError} for a document that isn't even
 * structurally a `PatchesPage` (no `pages` array at all) — there is nothing to render then.
 */
export function parsePageLenient(input: unknown): PatchesPageView {
  if (typeof input !== 'object' || input === null) {
    throw new PageValidationError('Page document must be a JSON object.');
  }
  const record = input as Record<string, unknown>;
  const version = typeof record.version === 'number' ? record.version : undefined;
  if (version === undefined) {
    throw new PageValidationError('Page document is missing a schema version.');
  }
  if (!Array.isArray(record.pages)) {
    throw new PageValidationError('Page document is missing its "pages" array.');
  }

  const pages = record.pages
    .slice(0, PAGE_MAX_SUBPAGES)
    .map(parseSubPageLenient)
    .filter((subPage): subPage is PatchesSubPageView => subPage !== undefined);

  return {
    version,
    theme: parseThemeLenient(record.theme),
    pages,
  };
}

/** Parses with {@link parsePageStrict} first (the common case — every revision this server
 * ever wrote is already valid) and only falls back to {@link parsePageLenient} if that fails,
 * e.g. a document imported from a future schema version. Prefer this for `GetPage`'s read
 * path. */
export function parsePageForRender(input: unknown): PatchesPageView {
  try {
    const strict = parsePageStrict(input);
    return {
      version: strict.version,
      theme: strict.theme,
      pages: strict.pages,
    };
  } catch (error) {
    if (!isPageValidationError(error)) throw error;
    return parsePageLenient(input);
  }
}
