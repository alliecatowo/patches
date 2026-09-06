/** Fast-path pattern matching any control character stripped or converted by sanitizeForTerminal.
 * Matches ASCII C0 controls (except \n), tab \t, DEL (0x7f), and C1 controls (0x80-0x9f). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0b-\x1f\x7f-\x9f\t]/u;

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
export function sanitizeForTerminal(value: string): string {
  // Fast path: if string carries no tabs, C0, or C1 control characters, return as-is (~9x faster).
  if (!CONTROL_CHAR_PATTERN.test(value)) return value;

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
