import { parsePageForRender, type PatchesPageView } from '@patches/domain';

/**
 * `GetPageResponse.document` arrives as raw bytes (UTF-8 JSON) over Connect.
 * Decodes and validates it with `@patches/domain`'s lenient, render-time
 * parser — the same one the server and TUI use — so an unrecognized block
 * type degrades to a placeholder instead of breaking the page (spec §171).
 * Returns `null` for a document that isn't parseable at all rather than
 * throwing, since an empty/missing wall is a normal, renderable state.
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
