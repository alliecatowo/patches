/**
 * Colour support detection and ANSI SGR colour sequence helpers for the art renderers
 * (`half-block-renderer.ts`, used at 'truecolor'/'256' — `ascii-renderer.ts` never
 * emits colour at all). See `docs/research/terminal-image-art.md` for citations.
 */

export type ColorSupport = 'truecolor' | '256' | 'none';

/**
 * How much colour we're allowed to draw with.
 *
 * - `NO_COLOR` (any *non-empty* value, per no-color.org — "when present and not an
 *   empty string (regardless of its value)") and `TERM=dumb`/unset both mean 'none':
 *   the caller must use the colourless `AsciiRenderer`, never emit an SGR sequence at
 *   all. `NO_COLOR=` (present but empty) does NOT disable colour — the letter of the
 *   convention explicitly carves that out.
 * - `COLORTERM=truecolor`/`24bit` is the only signal we trust for 24-bit colour —
 *   `TERM` alone never claims truecolor support.
 * - Everything else that isn't explicitly colourless is assumed to support the
 *   256-colour palette; this is the safe default for any real terminal emulator
 *   still in use, and 256-colour output degrades gracefully (never garbage) on
 *   anything that understands basic ANSI SGR.
 */
export function detectColorSupport(env: NodeJS.ProcessEnv = process.env): ColorSupport {
  if (env['NO_COLOR'] !== undefined && env['NO_COLOR'] !== '') return 'none';
  // Checked before `TERM`: `COLORTERM=truecolor` is a strong, explicit signal on its
  // own (many real setups — tmux, screen, some CI shells — export it without ever
  // setting a matching `TERM`), so it must win over an empty/absent `TERM` rather
  // than being shadowed by the "no TERM at all" -> 'none' fallback below.
  const colorterm = (env['COLORTERM'] ?? '').toLowerCase();
  if (colorterm === 'truecolor' || colorterm === '24bit') return 'truecolor';
  const term = env['TERM'] ?? '';
  if (term === '' || term === 'dumb') return 'none';
  return '256';
}

/**
 * Nearest xterm 256-colour palette index (16-231 colour cube, 232-255 greyscale
 * ramp) for a truecolor RGB triple. Matches the rounding convention used by chalk's
 * `ansi-styles`/`color-convert` (`rgbToAnsi256`) against the xterm palette documented
 * in `ctlseqs.html` (see the research note).
 */
export function rgbToAnsi256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  return (
    16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5)
  );
}

export const RESET_FG = '\x1b[39m';
export const RESET_BG = '\x1b[49m';
/** Full attribute reset — written once at the end of every art row so nothing the
 * renderer set (colour, in particular) bleeds into whatever Ink draws next. */
export const RESET_ALL = '\x1b[0m';

/** `\x1b[38;2;r;g;bm` (truecolor) or `\x1b[38;5;<n>m` (256-colour quantized). */
export function fgColor(r: number, g: number, b: number, support: 'truecolor' | '256'): string {
  return support === 'truecolor'
    ? `\x1b[38;2;${String(r)};${String(g)};${String(b)}m`
    : `\x1b[38;5;${String(rgbToAnsi256(r, g, b))}m`;
}

/** `\x1b[48;2;r;g;bm` (truecolor) or `\x1b[48;5;<n>m` (256-colour quantized). */
export function bgColor(r: number, g: number, b: number, support: 'truecolor' | '256'): string {
  return support === 'truecolor'
    ? `\x1b[48;2;${String(r)};${String(g)};${String(b)}m`
    : `\x1b[48;5;${String(rgbToAnsi256(r, g, b))}m`;
}
