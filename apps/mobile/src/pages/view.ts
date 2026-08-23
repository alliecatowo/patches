import { sanitizeText, type PatchesSubPageView, type RenderablePageBlock } from '@patches/domain';

import { safePageHref } from './href.js';

/**
 * Block → viewmodel mapping for the mobile Pages viewer (spec §170–172, B-082). The screen
 * (`screens/PageScreen.tsx`/`components/PageBlocks.tsx`) stays thin per
 * `docs/research/expo-react-native.md` §4: every string decision — sanitization, label
 * fallbacks, placeholder copy, ref classification, default limits — happens here, in plain
 * RN-free TypeScript, so it is the part Vitest covers.
 *
 * Sanitization is the render-time second pass on top of the server's write-time pass
 * (defense in depth, mirroring `apps/web`'s `PageBlocks`).
 */

/** Spacer heights in density-independent pixels — RN's equivalent of the web rem / TUI
 * cell-row sizing (`sm`/`md`/`lg`). */
const SPACER_HEIGHTS = { sm: 16, md: 32, lg: 48 } as const;

export interface LinkEntryView {
  /** Sanitized label; may be `''`, in which case the href itself is the display text. */
  label: string;
  /** Re-validated http(s) href to open via `Linking`, or `null` when it must render as
   * inert text (non-http(s) scheme, control bytes, unparseable). */
  href: string | null;
  /** Sanitized original href — the display fallback when `label === ''`. */
  rawHref: string;
}

export interface TopEightEntryView {
  /** Sanitized original `@handle`/`@handle@node` ref — the fallback display. */
  ref: string;
  /** The bare local handle when the ref is `@handle` with no `@node` part — the only form
   * `ActorService.GetActorByHandle` can resolve (spec §174: federation is a seam). `null`
   * for remote refs, which render as inert text. */
  localHandle: string | null;
}

export type PageBlockView =
  | { kind: 'body'; text: string }
  | { kind: 'ascii'; art: string }
  | { kind: 'hero'; title: string; subtitle: string | null }
  | { kind: 'nowPlaying'; text: string }
  | { kind: 'spacer'; height: number }
  | { kind: 'image'; mediaId: string; alt: string }
  | { kind: 'links'; entries: LinkEntryView[] }
  | { kind: 'posts'; limit: number }
  | { kind: 'topEight'; entries: TopEightEntryView[] }
  | { kind: 'guestbook'; limit: number }
  | { kind: 'placeholder'; label: string };

function body(value: string): string {
  return sanitizeText(value, { multiline: true });
}

function line(value: string): string {
  return sanitizeText(value, { multiline: false });
}

/** A `@handle`/`@handle@node` ref split into its display + resolvable parts. The domain
 * write-time schema bounds these to 100 chars; a leniently-parsed document can still carry
 * longer/weirder refs, so this re-sanitizes rather than trusting length. */
function topEightEntry(ref: string): TopEightEntryView {
  const sanitized = line(ref);
  const bare = sanitized.startsWith('@') ? sanitized.slice(1) : sanitized;
  return { ref: sanitized, localHandle: bare.includes('@') || bare === '' ? null : bare };
}

/**
 * Maps one (leniently parsed) block to its inert viewmodel. Never throws: unrecognized block
 * types and the v1 types this viewer doesn't support (`Gallery`/`Friends`/`Badges` — web
 * parity, B-080) degrade to a visible placeholder (§171's "never fail the page" rule).
 */
export function toBlockView(block: RenderablePageBlock): PageBlockView {
  switch (block.type) {
    case 'Text':
    case 'Markdown':
      // Plain-ish rendering: RN has no markdown renderer in this app's dependency set, and
      // the source markdown is inert text — showing it as-is loses nothing structural.
      return { kind: 'body', text: body(block.body) };
    case 'AsciiArt':
      return { kind: 'ascii', art: body(block.art) };
    case 'Hero':
      return {
        kind: 'hero',
        title: line(block.title),
        subtitle:
          block.subtitle === undefined || block.subtitle === '' ? null : line(block.subtitle),
      };
    case 'NowPlaying':
      return { kind: 'nowPlaying', text: line(block.text) };
    case 'Spacer':
      return { kind: 'spacer', height: SPACER_HEIGHTS[block.size ?? 'md'] };
    case 'Image':
      return { kind: 'image', mediaId: block.mediaId, alt: line(block.alt ?? '') };
    case 'Links':
      return {
        kind: 'links',
        entries: block.links.map((link) => ({
          label: line(link.label),
          href: safePageHref(link.href),
          rawHref: line(link.href),
        })),
      };
    case 'Posts':
      return { kind: 'posts', limit: block.limit ?? 5 };
    case 'TopEight':
      return { kind: 'topEight', entries: block.actors.map(topEightEntry) };
    case 'Guestbook':
      return { kind: 'guestbook', limit: block.limit ?? 20 };
    case 'Gallery':
      return { kind: 'placeholder', label: 'Gallery block — not supported in this app yet' };
    case 'Friends':
      return { kind: 'placeholder', label: 'Friends block — not supported in this app yet' };
    case 'Badges':
      return { kind: 'placeholder', label: 'Badges — not supported in this app yet' };
    case 'Unknown':
      return { kind: 'placeholder', label: `[unsupported block: ${line(block.originalType)}]` };
    default:
      // Exhaustiveness guard: a future `RenderablePageBlock` variant this mapper hasn't
      // caught yet fails typecheck above rather than silently rendering nothing.
      return blockNever(block);
  }
}

export function toBlockViews(blocks: readonly RenderablePageBlock[]): PageBlockView[] {
  return blocks.map(toBlockView);
}

/** Sub-page tab label: the title, falling back to the slug — the same choice the web route
 * makes. Slugs are schema-constrained (`PAGE_SLUG_PATTERN`), titles are re-sanitized. */
export function subPageTabLabel(subPage: PatchesSubPageView): string {
  return line(subPage.title === '' ? subPage.slug : subPage.title);
}

/** Guestbook entry bodies arrive over RPC (not in the document), so they get the same
 * render-time sanitization pass as document text rather than being trusted raw. */
export function guestbookEntryBody(entryBody: string): string {
  return body(entryBody);
}

function blockNever(block: never): PageBlockView {
  return { kind: 'placeholder', label: `[unsupported block: ${JSON.stringify(block)}]` };
}
