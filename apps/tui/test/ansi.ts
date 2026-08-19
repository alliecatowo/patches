/**
 * Frames rendered by `ink-testing-library` carry SGR colour sequences whenever the
 * process has colour support, and none when it doesn't (see `vitest.config.ts`, which
 * pins it on). Two things follow: assertions about *characters* must strip SGR first,
 * and a themed phrase like "Enter run · Tab complete" is split across several `<Text>`
 * nodes, so a raw `includes` misses text that is plainly on screen.
 *
 * Only the SGR (`ESC [ … m`) family is stripped. Anything else reaching a frame — a
 * cursor move, an erase, an OSC/APC payload — is a bug we want a test to notice, never
 * something a helper should quietly launder away.
 *
 * Scanned by code point rather than with a regular expression, which is how
 * `src/format/sanitize.ts` handles the same problem: a control character inside a
 * regex literal trips `no-control-regex`.
 */
const ESCAPE = 0x1b;

function isParameterByte(char: string | undefined): boolean {
  if (char === undefined) return false;
  return char === ';' || (char >= '0' && char <= '9');
}

export function stripSgr(frame: string): string {
  let out = '';
  let index = 0;
  while (index < frame.length) {
    if (frame.codePointAt(index) !== ESCAPE || frame[index + 1] !== '[') {
      out += frame[index];
      index += 1;
      continue;
    }
    // Walk the parameter bytes of a CSI sequence; only a final `m` makes it SGR.
    let scan = index + 2;
    while (isParameterByte(frame[scan])) scan += 1;
    if (frame[scan] === 'm') {
      index = scan + 1;
      continue;
    }
    out += frame[index];
    index += 1;
  }
  return out;
}

/** True when the frame carries any escape sequence at all (SGR or otherwise). */
export function hasEscapeSequences(frame: string): boolean {
  for (const char of frame) if (char.codePointAt(0) === ESCAPE) return true;
  return false;
}

/**
 * True when the frame carries an escape sequence that is *not* SGR colour — a cursor
 * move, an erase, an OSC/APC payload. That is the shape a hostile remote string tries
 * to smuggle through, so sanitisation tests assert on this rather than on "no escapes
 * at all", which the theme's own colour would trip.
 */
export function hasNonSgrEscape(frame: string): boolean {
  return hasEscapeSequences(stripSgr(frame));
}
