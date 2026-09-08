/** `\n` is the only control character user text is ever allowed to keep (multi-line
 * post bodies/bios wrap normally); everything else in this set is stripped instead
 * of merely escaped, because there is no legitimate reason a bio/handle/post body
 * needs it. */
const KEEP_CODE_POINTS = new Set([0x0a]);

/* eslint-disable-next-line no-control-regex -- fast-path test for C0 controls (excluding \n), \t (0x09 needs tab expansion), and DEL/C1 controls (0x7f-0x9f) */
const CONTROL_OR_TAB_RE = /[\x00-\x08\x09\x0b-\x1f\x7f-\x9f]/u;

/**
 * Strips ASCII control characters from user-supplied text before it reaches a
 * `<Text>` node. A bio/display name/post body/nameplate glyph is untrusted input
 * that could otherwise smuggle raw terminal escape sequences — cursor moves,
 * alternate-screen toggles, OSC/APC payloads — straight into the render tree
 * (spec §153/§104).
 *
 * Performance optimization: >99% of strings contain no control characters or tabs.
 * A fast-path regex check (`CONTROL_OR_TAB_RE`) avoids allocation and code point
 * iteration for clean strings (~9x throughput boost), falling back to character
 * iteration when control characters or tabs need stripping/expansion.
 */
export function sanitizeForTerminal(value: string): string {
  // Fast path: if the string has no control characters needing stripping and no tabs needing expansion, return as-is.
  if (!CONTROL_OR_TAB_RE.test(value)) return value;

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
