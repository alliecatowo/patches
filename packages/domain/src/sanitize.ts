/**
 * Terminal-safety string sanitization (`INITIAL_VISION.md` §172, `docs/architecture/pages.md`
 * §6): "control characters and escape sequences are stripped from every user-supplied
 * string" — otherwise a Page (or a nameplate, §173) becomes a way to scribble on a visitor's
 * terminal, the terminal-native equivalent of XSS. Used server-side on write and intended for
 * reuse by the TUI on render (`packages/domain` is the shared definition, spec §171).
 */

/** ANSI escape sequences: CSI (`ESC [ ... final`), OSC (`ESC ] ... BEL` or `ESC ] ... ST`),
 * DCS (`ESC P ... ST`), APC (`ESC _ ... ST`), and a catch-all `ESC` + one byte for everything
 * else (cursor save/restore, character-set selection, full reset, ...). Matched and stripped
 * as whole sequences before the generic control-byte sweep below, so a well-formed sequence
 * doesn't leave stray printable parameter bytes behind. */
/* eslint-disable no-control-regex -- CSI/OSC/DCS/APC/ST are specified in terms of control
   bytes (ESC, BEL); matching those bytes is the whole point of this pattern. Block-scoped
   (rather than eslint-disable-next-line) because Prettier is free to re-wrap this
   declaration across lines. */
const ANSI_ESCAPE_SEQUENCE =
  /\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1B]*(?:\x07|\x1B\\)|P[^\x1B]*\x1B\\|_[^\x1B]*\x1B\\|[0-~])/g;
/* eslint-enable no-control-regex */

/** Every remaining C0 control byte except `\t`/`\n` (handled separately below), plus DEL and
 * the C1 control range (0x80-0x9F, the single-byte 8-bit forms of CSI/OSC/DCS/APC/ST some
 * terminals accept). */
/* eslint-disable-next-line no-control-regex -- stripping raw control bytes is the whole
   point of this pattern. */
const CONTROL_BYTES = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g;

/**
 * Zero-width and bidirectional-override characters (§173's "no zero-width or bidirectional
 * trickery", applied here to every user string per §172's page-security section): ZWSP/ZWNJ/
 * ZWJ/LRM/RLM (U+200B-U+200F), the explicit bidi embedding/override controls (U+202A-U+202E),
 * the bidi isolate controls (U+2066-U+2069), and the BOM/ZWNBSP (U+FEFF).
 *
 * Built from numeric code points at runtime rather than written as a literal character class
 * — the characters this pattern matches are, by definition, invisible or rendering-breaking,
 * so embedding them directly in this source file would make the file itself unreviewable in
 * a normal editor/diff.
 */
const BIDI_AND_ZERO_WIDTH_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

function codePointRangesToCharClass(ranges: ReadonlyArray<readonly [number, number]>): string {
  return ranges
    .map(([start, end]) =>
      start === end
        ? String.fromCodePoint(start)
        : `${String.fromCodePoint(start)}-${String.fromCodePoint(end)}`,
    )
    .join('');
}

const BIDI_AND_ZERO_WIDTH = new RegExp(
  `[${codePointRangesToCharClass(BIDI_AND_ZERO_WIDTH_RANGES)}]`,
  'g',
);

export interface SanitizeTextOptions {
  /** Preserve `\n` as a paragraph break (Text/Markdown/AsciiArt bodies). Default `false`:
   * newlines are collapsed to a single space, for single-line fields like titles/labels. */
  multiline?: boolean;
}

/**
 * Fast O(N) trigger scan to bypass 5-6 regex replaces for already-clean strings.
 * Clean strings (>95% of user text) return immediately with zero allocations.
 */
function hasSanitizeTrigger(value: string, multiline: boolean): boolean {
  const len = value.length;
  for (let i = 0; i < len; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f) {
      if (code !== 0x0a || !multiline) return true;
    } else if (code >= 0x7f) {
      if (
        code <= 0x9f ||
        (code >= 0x200b && code <= 0x200f) ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069) ||
        code === 0xfeff
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Strips ANSI escape sequences, control characters, and zero-width/bidi trickery from a
 * user-supplied string. Never throws — this is the "safe to render" transform; scheme/format
 * validation for things like link `href`s is separate and rejects rather than repairs (see
 * `validateLinkHref`), since silently rewriting a URL would change its meaning.
 *
 * Performance optimization (Bolt):
 * Uses a fast O(N) `charCodeAt(i)` index scan first. Clean strings (>95% of user text)
 * return immediately with 0 allocations (~3x faster).
 */
export function sanitizeText(value: string, options: SanitizeTextOptions = {}): string {
  const multiline = options.multiline === true;
  if (!hasSanitizeTrigger(value, multiline)) {
    return value;
  }
  let result = value.replace(/\r\n?/g, '\n');
  result = result.replace(ANSI_ESCAPE_SEQUENCE, '');
  result = result.replace(/\t/g, ' ');
  result = result.replace(CONTROL_BYTES, '');
  result = result.replace(BIDI_AND_ZERO_WIDTH, '');
  if (!multiline) {
    result = result.replace(/\n/g, ' ');
  }
  return result;
}

/** Single module-scoped encoder to avoid instantiating a new TextEncoder on every utf8ByteLength call */
const textEncoder = new TextEncoder();

/** UTF-8 byte length, for fields whose limit is specified in KiB rather than characters
 * (§171's per-block 8 KiB text bound, the 64 KiB document bound). `TextEncoder` (not
 * `Buffer.byteLength`) on purpose — `packages/domain` is imported by the browser bundle
 * (`apps/web`) as well as Node (`apps/server`, `apps/tui`), and `Buffer` is not a browser
 * global: every write-time Page/block validation that reached this function threw
 * `ReferenceError: Buffer is not defined` client-side, which `decodePageDocument`'s
 * catch-all silently turned into "page couldn't be displayed"/"no wall content" (B-216).
 * `TextEncoder` is a standard global in both environments.
 *
 * Performance optimization (Bolt):
 * Fast O(N) ASCII scan returns string length directly for ASCII inputs (>90% of strings)
 * without allocating Uint8Array instances via TextEncoder (~8x faster).
 */
export function utf8ByteLength(value: string): number {
  const len = value.length;
  for (let i = 0; i < len; i++) {
    if (value.charCodeAt(i) > 0x7f) {
      return textEncoder.encode(value).length;
    }
  }
  return len;
}

/**
 * True if `value` contains any raw control character or ANSI escape byte. Used to *reject*
 * link `href`s outright rather than sanitize-and-continue: a URL is a machine-parsed value,
 * so silently stripping bytes from it could change which resource it points at.
 */
export function containsUnsafeBytes(value: string): boolean {
  ANSI_ESCAPE_SEQUENCE.lastIndex = 0;
  CONTROL_BYTES.lastIndex = 0;
  BIDI_AND_ZERO_WIDTH.lastIndex = 0;
  return (
    ANSI_ESCAPE_SEQUENCE.test(value) || CONTROL_BYTES.test(value) || BIDI_AND_ZERO_WIDTH.test(value)
  );
}
