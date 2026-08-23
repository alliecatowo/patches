import {
  ALLOWED_LINK_SCHEMES,
  containsUnsafeBytes,
  parsePageForRender,
  type PatchesPageView,
} from '@patches/domain';

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

/**
 * Render-time link-href check for Page `Links` blocks — the same contract as
 * `packages/domain`'s write-time `linkHrefSchema`: only `http`/`https`
 * (`ALLOWED_LINK_SCHEMES`, spec §104/§172), and a URL carrying control or
 * escape bytes is rejected outright rather than repaired, since stripping
 * bytes from a machine-parsed URL could change what it points at. Returns the
 * href to render as an anchor, or `null` when the caller must render the
 * entry as inert text instead.
 */
export function safePageHref(href: string): string | null {
  const trimmed = href.trim();
  if (trimmed === '' || containsUnsafeBytes(trimmed)) return null;
  let protocol: string;
  try {
    protocol = new URL(trimmed).protocol;
  } catch {
    return null;
  }
  return (ALLOWED_LINK_SCHEMES as readonly string[]).includes(protocol) ? trimmed : null;
}
