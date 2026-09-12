/** Fast-path pattern matching ASCII C0 control chars (0x00-0x1F, except 0x0A \n), \t (0x09), DEL (0x7F), and C1 control chars (0x80-0x9F). */
// eslint-disable-next-line no-control-regex -- fast-path pattern matching ASCII control characters
const CONTROL_CHARS_PATTERN = /[\x00-\x08\x09\x0b-\x1f\x7f-\x9f]/;

/**
 * Strips ASCII control characters and C1 control codes from user-supplied text before
 * it reaches a renderer. A bio/display name/post body/nameplate glyph is untrusted
 * input that could otherwise smuggle raw terminal escape sequences (cursor moves,
 * alternate-screen toggles, OSC/APC payloads) into the TUI, or stray control
 * characters into the DOM (spec §153/§104). Iterating by code point (not a regex)
 * sidesteps `no-control-regex` entirely and handles surrogate pairs correctly.
 *
 * This is the one sanitizer every consumer of `parseMarkup` runs first, on the raw
 * source — duplicated verbatim in `apps/tui/src/format/sanitize.ts` rather than
 * re-exported from here, since that file is owned by the TUI and imported directly
 * by many TUI components outside the markup pipeline.
 */
export function sanitizeForTerminal(value: string): string {
  // Fast path: if the string contains no control characters or tabs, return it directly.
  if (!CONTROL_CHARS_PATTERN.test(value)) {
    return value;
  }

  let out = '';
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint === 0x09) {
      out += ' '; // tab -> single space, so tab-separated text doesn't collapse together
      continue;
    }
    if (codePoint === 0x0a) {
      out += char;
      continue;
    }
    const isC0 = codePoint <= 0x1f;
    const isDelOrC1 = codePoint >= 0x7f && codePoint <= 0x9f;
    if (isC0 || isDelOrC1) continue;
    out += char;
  }
  return out;
}
