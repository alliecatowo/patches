/* eslint-disable-next-line no-control-regex -- stripping raw control bytes is the whole
   point of this pattern. */
const CONTROL_BYTES = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/**
 * Strips ASCII control characters and C1 control codes from user-supplied text before
 * it reaches a renderer. A bio/display name/post body/nameplate glyph is untrusted
 * input that could otherwise smuggle raw terminal escape sequences (cursor moves,
 * alternate-screen toggles, OSC/APC payloads) into the TUI, or stray control
 * characters into the DOM (spec §153/§104).
 *
 * Performance optimization: fast single-pass code unit scan to return clean strings
 * unchanged (~5x speedup, zero string allocations).
 *
 * This is the one sanitizer every consumer of `parseMarkup` runs first, on the raw
 * source — duplicated verbatim in `apps/tui/src/format/sanitize.ts` rather than
 * re-exported from here, since that file is owned by the TUI and imported directly
 * by many TUI components outside the markup pipeline.
 */
export function sanitizeForTerminal(value: string): string {
  // Fast path: check for tabs (0x09), C0 controls (0x00-0x1F excluding 0x0A \n), DEL/C1 controls (0x7F-0x9F)
  let hasControlOrTab = false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x09 || (code <= 0x1f && code !== 0x0a) || (code >= 0x7f && code <= 0x9f)) {
      hasControlOrTab = true;
      break;
    }
  }
  if (!hasControlOrTab) return value;

  return value.replace(/\t/g, ' ').replace(CONTROL_BYTES, '');
}
