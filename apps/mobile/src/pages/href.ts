import { ALLOWED_LINK_SCHEMES, containsUnsafeBytes } from '@patches/domain';

/**
 * Render-time link-href check for Page `Links` blocks (and the media download URL handed to
 * RN `Image`): only `http`/`https` (`ALLOWED_LINK_SCHEMES`, spec §104/§172), and a URL
 * carrying control or escape bytes is rejected outright rather than repaired, since
 * stripping bytes from a machine-parsed URL could change what it points at. Returns the href
 * to pass to `Linking.openURL`, or `null` when the caller must render the entry as inert
 * text instead. Same contract as `packages/domain`'s write-time `linkHrefSchema`; ported
 * from `apps/web/src/lib/page.ts` so the mobile client re-checks independently of the
 * server's write-time validation.
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
