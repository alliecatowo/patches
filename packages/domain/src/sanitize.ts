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
 * Strips ANSI escape sequences, control characters, and zero-width/bidi trickery from a
 * user-supplied string. Never throws — this is the "safe to render" transform; scheme/format
 * validation for things like link `href`s is separate and rejects rather than repairs (see
 * `validateLinkHref`), since silently rewriting a URL would change its meaning.
 */
export function sanitizeText(value: string, options: SanitizeTextOptions = {}): string {
  let result = value.replace(/\r\n?/g, '\n');
  result = result.replace(ANSI_ESCAPE_SEQUENCE, '');
  result = result.replace(/\t/g, ' ');
  result = result.replace(CONTROL_BYTES, '');
  result = result.replace(BIDI_AND_ZERO_WIDTH, '');
  if (options.multiline !== true) {
    result = result.replace(/\n/g, ' ');
  }
  return result;
}

/** UTF-8 byte length, for fields whose limit is specified in KiB rather than characters
 * (§171's per-block 8 KiB text bound, the 64 KiB document bound). */
export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
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
