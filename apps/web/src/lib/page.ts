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

/** Conservative allowlist for a page-document theme color applied as a `--page-*` CSS
 * custom property (§171's theme fields): hex (`#rgb`…`#rrggbbaa`), a bare named color,
 * or an `rgb()`/`hsl()` functional form with only digits, commas, spaces, dots, and
 * percent signs inside. Anything else — including anything carrying control or escape
 * bytes — renders with the node's default theme instead: cosmetics must never become
 * an injection vector (§172), and a custom property set through the style object can't
 * be relied on alone as the boundary. Returns `null` when the caller must skip the field. */
const PAGE_THEME_COLOR_PATTERN = /^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(?:rgb|hsl)a?\([0-9 ,.%]+\))$/;

export function safePageThemeColor(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length > 32 || containsUnsafeBytes(trimmed)) return null;
  return PAGE_THEME_COLOR_PATTERN.test(trimmed) ? trimmed : null;
}
