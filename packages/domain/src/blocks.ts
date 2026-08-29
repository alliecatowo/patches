import { z } from 'zod';

import {
  PAGE_LINK_HREF_MAX_CHARS,
  PAGE_LINK_GROUP_MAX_CHARS,
  PAGE_LINK_LABEL_MAX_CHARS,
  PAGE_MAX_BLOCK_TEXT_BYTES,
  PAGE_MAX_GALLERY_ITEMS,
  PAGE_MAX_LINKS_PER_BLOCK,
  PAGE_MAX_TOP_EIGHT,
  PAGE_SHORT_TEXT_MAX_CHARS,
} from './limits.js';
import { containsUnsafeBytes, sanitizeText, utf8ByteLength } from './sanitize.js';

/**
 * Block schemas for the v1 vocabulary (`INITIAL_VISION.md` §171's code block: `Text |
 * Markdown | Image | Links | Posts | Gallery | Friends | TopEight | Guestbook | NowPlaying |
 * Badges | AsciiArt | Spacer | Hero`). Every schema is `.strict()` — unknown fields are
 * rejected on write (§171 "strict on write"); `page.ts`'s lenient reader relaxes this for
 * rendering.
 *
 * Every free-text field is sanitized with `sanitizeText` (§172) before its length is
 * checked, so the enforced bound is on the text a renderer will actually show, not on bytes
 * that get stripped anyway.
 */

/** A single-line, sanitized, length-bounded string field. Exported for reuse by `page.ts`
 * (theme/title/slug fields need the same treatment). */
export function shortText(maxChars: number) {
  return z
    .string()
    .transform((value) => sanitizeText(value, { multiline: false }).trim())
    .pipe(z.string().max(maxChars));
}

/** A multi-line, sanitized string field bounded in UTF-8 bytes (§171's per-block 8 KiB). */
function boundedBody(maxBytes: number = PAGE_MAX_BLOCK_TEXT_BYTES) {
  return z
    .string()
    .transform((value) => sanitizeText(value, { multiline: true }))
    .refine((value) => utf8ByteLength(value) <= maxBytes, {
      message: `must be at most ${String(maxBytes)} bytes`,
    });
}

/**
 * A link `href`: rejected outright (never silently rewritten) if it contains a raw control
 * byte, and restricted to the `http`/`https` scheme allowlist (`INITIAL_VISION.md` §104,
 * amended §172 — `javascript:`, `data:`, `file:` and everything else are rejected).
 */
const linkHrefSchema = z
  .string()
  .trim()
  .max(PAGE_LINK_HREF_MAX_CHARS)
  .refine((value) => !containsUnsafeBytes(value), {
    message: 'href must not contain control characters or escape sequences',
  })
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === 'http:' || new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'href must be a valid http(s) URL' },
  );

/** `@handle` or `@handle@node` (federation-ready per §170's addressing). Loose on purpose —
 * full handle validation lives with `ActorService`; this only bounds length and rejects
 * unsafe bytes so a TopEight/Friends list can't smuggle escape sequences. */
const actorRefSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .refine((value) => !containsUnsafeBytes(value), {
    message: 'actor reference must not contain control characters or escape sequences',
  })
  .refine((value) => value.startsWith('@'), { message: 'actor reference must start with @' });

/** A Patches media id — Image/Gallery reference media by id only, never a remote URL (§172:
 * "Images in a Page MUST be Patches media"). */
const mediaIdSchema = z.uuid('must be a Patches media id');

const textBlockSchema = z
  .object({
    type: z.literal('Text'),
    body: boundedBody(),
  })
  .strict();

const markdownBlockSchema = z
  .object({
    type: z.literal('Markdown'),
    body: boundedBody(),
  })
  .strict();

const linksBlockSchema = z
  .object({
    type: z.literal('Links'),
    links: z
      .array(
        z
          .object({
            label: shortText(PAGE_LINK_LABEL_MAX_CHARS),
            href: linkHrefSchema,
            /** Optional group heading — a link-tree-like collection groups its entries
             * under labelled headings (B-119). Absent for an ungrouped entry (old
             * documents parse unchanged); renderers show a group heading when present
             * and a plain list entry when absent. Empty-after-sanitize (`''`) is
             * normalized to absent so a blank group field never renders a stray
             * heading. */
            group: shortText(PAGE_LINK_GROUP_MAX_CHARS)
              .optional()
              .transform((value) => (value === '' ? undefined : value)),
          })
          .strict(),
      )
      .max(PAGE_MAX_LINKS_PER_BLOCK),
  })
  .strict();

const postsBlockSchema = z
  .object({
    type: z.literal('Posts'),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

const topEightBlockSchema = z
  .object({
    type: z.literal('TopEight'),
    actors: z.array(actorRefSchema).max(PAGE_MAX_TOP_EIGHT),
  })
  .strict();

const friendsBlockSchema = z
  .object({
    type: z.literal('Friends'),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

const guestbookBlockSchema = z
  .object({
    type: z.literal('Guestbook'),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const badgesBlockSchema = z
  .object({
    type: z.literal('Badges'),
  })
  .strict();

const asciiArtBlockSchema = z
  .object({
    type: z.literal('AsciiArt'),
    art: boundedBody(),
  })
  .strict();

const SPACER_SIZES = ['sm', 'md', 'lg'] as const;

const spacerBlockSchema = z
  .object({
    type: z.literal('Spacer'),
    size: z.enum(SPACER_SIZES).optional(),
  })
  .strict();

const heroBlockSchema = z
  .object({
    type: z.literal('Hero'),
    title: shortText(PAGE_SHORT_TEXT_MAX_CHARS),
    subtitle: shortText(PAGE_SHORT_TEXT_MAX_CHARS).optional(),
  })
  .strict();

const nowPlayingBlockSchema = z
  .object({
    type: z.literal('NowPlaying'),
    text: shortText(PAGE_SHORT_TEXT_MAX_CHARS),
  })
  .strict();

const imageBlockSchema = z
  .object({
    type: z.literal('Image'),
    mediaId: mediaIdSchema,
    alt: shortText(PAGE_SHORT_TEXT_MAX_CHARS).optional(),
  })
  .strict();

const galleryBlockSchema = z
  .object({
    type: z.literal('Gallery'),
    mediaIds: z.array(mediaIdSchema).min(1).max(PAGE_MAX_GALLERY_ITEMS),
    caption: shortText(PAGE_SHORT_TEXT_MAX_CHARS).optional(),
  })
  .strict();

/** Every known block schema, keyed by its `type` discriminant — the write-time (strict)
 * union. Order matches §171's listing. */
export const BLOCK_SCHEMAS = {
  Text: textBlockSchema,
  Markdown: markdownBlockSchema,
  Image: imageBlockSchema,
  Links: linksBlockSchema,
  Posts: postsBlockSchema,
  Gallery: galleryBlockSchema,
  Friends: friendsBlockSchema,
  TopEight: topEightBlockSchema,
  Guestbook: guestbookBlockSchema,
  NowPlaying: nowPlayingBlockSchema,
  Badges: badgesBlockSchema,
  AsciiArt: asciiArtBlockSchema,
  Spacer: spacerBlockSchema,
  Hero: heroBlockSchema,
} as const;

export const BLOCK_TYPES = Object.keys(BLOCK_SCHEMAS) as (keyof typeof BLOCK_SCHEMAS)[];

export const pageBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  markdownBlockSchema,
  imageBlockSchema,
  linksBlockSchema,
  postsBlockSchema,
  galleryBlockSchema,
  friendsBlockSchema,
  topEightBlockSchema,
  guestbookBlockSchema,
  nowPlayingBlockSchema,
  badgesBlockSchema,
  asciiArtBlockSchema,
  spacerBlockSchema,
  heroBlockSchema,
]);

export type PageBlock = z.infer<typeof pageBlockSchema>;

/**
 * The same block shapes, but tolerant of unknown *fields* within a known block type
 * (`.passthrough()` instead of `.strict()`). Used only by `page.ts`'s `parsePageLenient` —
 * a renderer built against a newer schema version may have sent fields this version doesn't
 * know about, and §171 only requires strictness on write, not on read.
 */
export const lenientPageBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema.passthrough(),
  markdownBlockSchema.passthrough(),
  imageBlockSchema.passthrough(),
  linksBlockSchema.passthrough(),
  postsBlockSchema.passthrough(),
  galleryBlockSchema.passthrough(),
  friendsBlockSchema.passthrough(),
  topEightBlockSchema.passthrough(),
  guestbookBlockSchema.passthrough(),
  nowPlayingBlockSchema.passthrough(),
  badgesBlockSchema.passthrough(),
  asciiArtBlockSchema.passthrough(),
  spacerBlockSchema.passthrough(),
  heroBlockSchema.passthrough(),
]);

/** A rendering-only placeholder for a block type this schema version doesn't recognize
 * (§171 — "a renderer MUST ignore block types it does not support, rendering a visible
 * placeholder rather than failing the page"). Never produced by `parsePageStrict`; only by
 * `parsePageLenient`. */
export interface UnknownPageBlock {
  type: 'Unknown';
  originalType: string;
}

export type RenderablePageBlock = PageBlock | UnknownPageBlock;
