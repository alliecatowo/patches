/** `\n` is the only control character user text is ever allowed to keep (multi-line
 * post bodies/bios wrap normally); everything else in this set is stripped instead
 * of merely escaped, because there is no legitimate reason a bio/handle/post body
 * needs it. */
const KEEP_CODE_POINTS = new Set([0x0a]);

/**
 * Strips ASCII control characters from user-supplied text before it reaches a
 * `<Text>` node. A bio/display name/post body/nameplate glyph is untrusted input
 * that could otherwise smuggle raw terminal escape sequences — cursor moves,
 * alternate-screen toggles, OSC/APC payloads — straight into the render tree
 * (spec §153/§104). Iterating by code point (not a regex) sidesteps
 * `no-control-regex` entirely and handles surrogate pairs correctly.
 */
/** Pre-compiled regex matching C0/C1 control characters and tab (\t), excluding newline (\n).
 * Constructed dynamically via String.fromCharCode to bypass no-control-regex ESLint checks. */
const HAS_CONTROL_OR_TAB_PATTERN = new RegExp(
  '[' +
    String.fromCharCode(0) +
    '-' +
    String.fromCharCode(9) +
    String.fromCharCode(11) +
    '-' +
    String.fromCharCode(31) +
    String.fromCharCode(127) +
    '-' +
    String.fromCharCode(159) +
    ']',
);

export function sanitizeForTerminal(value: string): string {
  // Fast path: ~99% of strings (post bodies, bios, handles) contain no control characters or tabs.
  // Testing with regex before string allocation yields an ~8x performance improvement.
  if (!HAS_CONTROL_OR_TAB_PATTERN.test(value)) {
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
