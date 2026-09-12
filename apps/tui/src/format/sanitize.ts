/** Fast-path pattern matching ASCII C0 control chars (0x00-0x1F, except 0x0A \n), \t (0x09), DEL (0x7F), and C1 control chars (0x80-0x9F). */
// eslint-disable-next-line no-control-regex -- fast-path pattern matching ASCII control characters
const CONTROL_CHARS_PATTERN = /[\x00-\x08\x09\x0b-\x1f\x7f-\x9f]/;

/**
 * Strips ASCII control characters from user-supplied text before it reaches a
 * `<Text>` node. A bio/display name/post body/nameplate glyph is untrusted input
 * that could otherwise smuggle raw terminal escape sequences — cursor moves,
 * alternate-screen toggles, OSC/APC payloads — straight into the render tree
 * (spec §153/§104). Iterating by code point (not a regex) sidesteps
 * `no-control-regex` entirely and handles surrogate pairs correctly.
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
