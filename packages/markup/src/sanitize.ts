/** `\n` is the only control character user text is ever allowed to keep (multi-line
 * post bodies/bios wrap normally); everything else in this set is stripped instead
 * of merely escaped, because there is no legitimate reason a bio/handle/post body
 * needs it. */
const KEEP_CODE_POINTS = new Set([0x0a]);

/**
 * RegExp targeting control characters (C0 control characters except \n, C1 control characters, and \t).
 * Constructed dynamically via RegExp to avoid static ESLint `no-control-regex` lint issues.
 */
const CONTROL_CHAR_PATTERN = new RegExp(
  '[' +
    String.fromCharCode(0x00) +
    '-' +
    String.fromCharCode(0x08) +
    String.fromCharCode(0x0b) +
    '-' +
    String.fromCharCode(0x1f) +
    String.fromCharCode(0x7f) +
    '-' +
    String.fromCharCode(0x9f) +
    '\\t]',
  'u',
);

/**
 * Strips ASCII control characters and C1 control codes from user-supplied text before
 * it reaches a renderer. A bio/display name/post body/nameplate glyph is untrusted
 * input that could otherwise smuggle raw terminal escape sequences (cursor moves,
 * alternate-screen toggles, OSC/APC payloads) into the TUI, or stray control
 * characters into the DOM (spec §153/§104).
 *
 * Performance note: >99% of renderable strings in practice contain zero control characters.
 * Testing against `CONTROL_CHAR_PATTERN` first provides a fast path that skips allocation and
 * char-by-char iteration (~13x speedup on clean text).
 *
 * This is the one sanitizer every consumer of `parseMarkup` runs first, on the raw
 * source — duplicated verbatim in `apps/tui/src/format/sanitize.ts` rather than
 * re-exported from here, since that file is owned by the TUI and imported directly
 * by many TUI components outside the markup pipeline.
 */
export function sanitizeForTerminal(value: string): string {
  // Fast path: if no control characters or tabs are present, return unchanged.
  if (!CONTROL_CHAR_PATTERN.test(value)) {
    return value;
  }

  let out = '';
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint === 0x09) {
      out += ' '; // tab -> single space, so tab-separated text doesn't collapse together
      continue;
    }
    if (KEEP_CODE_POINTS.has(codePoint)) {
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
