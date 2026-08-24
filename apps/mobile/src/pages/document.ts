import { parsePageForRender, type PatchesPageView, type PatchesSubPageView } from '@patches/domain';

/**
 * `GetPageResponse.document` arrives as raw bytes (UTF-8 JSON) over Connect. Decodes and
 * validates it with `@patches/domain`'s lenient, render-time parser — the same one the
 * server, web (`apps/web/src/lib/page.ts`), and TUI use — so an unrecognized block type
 * degrades to a placeholder instead of breaking the page (spec §171). Returns `null` for a
 * document that isn't parseable at all rather than throwing, since an empty/missing wall is
 * a normal, renderable state. Ported from `apps/web/src/lib/page.ts` (clients don't import
 * each other).
 */
export function decodePageDocument(document: Uint8Array): PatchesPageView | null {
  if (document.length === 0) return null;
  try {
    const json = new TextDecoder().decode(document);
    const parsed: unknown = JSON.parse(json);
    return parsePageForRender(parsed);
  } catch {
    return null;
  }
}

/**
 * The server resolves an empty request slug to the index sub-page and reports it back
 * (`GetPageResponse.active_slug`); match it to a document sub-page, falling back to the
 * first one — the same resolution the web route and the TUI's PageScreen perform. Returns
 * `null` only when the document has no renderable sub-pages at all.
 */
export function resolveActiveSubPage(
  view: PatchesPageView,
  activeSlug: string,
): PatchesSubPageView | null {
  return view.pages.find((subPage) => subPage.slug === activeSlug) ?? view.pages[0] ?? null;
}

/** Strips a leading `@` from user-supplied input — `GetPageRequest.handle` wants the bare
 * local handle, matching `ActorService.GetActorByHandle`'s convention. */
export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, '');
}
