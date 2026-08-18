/**
 * Pure builders for the kitty graphics protocol (Unicode-placeholder flavour).
 *
 * Nothing in this module performs I/O — every function returns strings that a caller
 * writes to a raw `process.stdout`. See `docs/research/ink-kitty-graphics.md` for the
 * verified protocol notes these builders encode.
 *
 * Wire format (APC): `ESC _ G <k=v,k=v,...> ; <base64 payload> ESC \`
 */
import { randomInt } from 'node:crypto';

import { MAX_PLACEHOLDER_INDEX, diacritic } from './diacritics.js';

/** Application Program Command introducer for a graphics escape code. */
export const APC_START = '\x1b_G';
/** String Terminator that closes an APC sequence. */
export const APC_END = '\x1b\\';

/** The Unicode image placeholder character, U+10EEEE. */
export const PLACEHOLDER = '\u{10EEEE}';

/**
 * Maximum base64 characters per escape code.
 *
 * kitty: "The pixel data must first be base64 encoded then chunked up into chunks no
 * larger than 4096 bytes. All chunks, except the last, must have a size that is a
 * multiple of 4." 4096 is itself a multiple of 4, so a fixed slice satisfies both rules.
 */
export const MAX_CHUNK_BASE64 = 4096;

/** Largest image id the protocol allows (32-bit, id 0 means "unset"). */
export const MAX_IMAGE_ID = 0xff_ff_ff_ff;

/** Largest image id encodable without a third (most-significant-byte) diacritic. */
export const MAX_24BIT_IMAGE_ID = 0xff_ff_ff;

/** Control keys of a graphics command, in the order they should appear on the wire. */
export type GraphicsControl = Record<string, string | number>;

function encodeControl(control: GraphicsControl): string {
  return Object.entries(control)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

/**
 * Build one graphics escape code from control keys and an optional binary payload.
 *
 * The payload is base64-encoded here; it is NOT chunked. Use {@link chunkTransmit} for
 * anything larger than {@link MAX_CHUNK_BASE64} base64 characters.
 */
export function buildGraphicsCommand(control: GraphicsControl, payload?: Uint8Array): string {
  const base64 = payload === undefined ? undefined : Buffer.from(payload).toString('base64');
  return buildGraphicsCommandBase64(control, base64);
}

/**
 * Build one graphics escape code from control keys and an already-base64-encoded payload.
 *
 * Omitting the payload omits the `;` separator entirely, which is what control-only
 * commands (delete, query-by-id, place) look like on the wire.
 */
export function buildGraphicsCommandBase64(control: GraphicsControl, base64?: string): string {
  const head = `${APC_START}${encodeControl(control)}`;
  return base64 === undefined ? `${head}${APC_END}` : `${head};${base64}${APC_END}`;
}

/** Options for {@link chunkTransmit}. */
export interface ChunkTransmitOptions {
  /** Image id (`i=`). 1..0xFFFFFFFF; ids are global to the terminal, so randomise them. */
  id: number;
  /** Display width in cells (`c=`). */
  cols: number;
  /** Display height in cells (`r=`). */
  rows: number;
  /** Quiet mode (`q=`). 2 = suppress OK *and* error replies. Defaults to 2. */
  quiet?: 0 | 1 | 2;
  /**
   * Create a *virtual* placement (`U=1`) instead of a real one. Defaults to true —
   * real placements are anchored to screen coordinates and ghost on every Ink rerender.
   */
  unicodePlaceholder?: boolean;
  /** Payload format (`f=`). 100 = PNG (the default), 24 = RGB, 32 = RGBA. */
  format?: number;
}

/**
 * Transmit an image and create a placement, split across as many escape codes as the
 * 4096-base64-character chunk limit requires.
 *
 * The first chunk carries the full control set (`a=T,U=1,i=,f=100,c=,r=,q=,m=`);
 * every continuation chunk carries only `m=` and `q=`, as the protocol requires
 * ("Subsequent chunks must have only the `m` and optionally `q` keys").
 *
 * @returns one string per escape code, to be written to stdout in order and with no
 *   other graphics command interleaved.
 */
export function chunkTransmit(bytes: Uint8Array, options: ChunkTransmitOptions): string[] {
  const { id, cols, rows, quiet = 2, unicodePlaceholder = true, format = 100 } = options;

  assertImageId(id);
  if (!Number.isInteger(cols) || cols <= 0) throw new RangeError(`cols must be >= 1, got ${cols}`);
  if (!Number.isInteger(rows) || rows <= 0) throw new RangeError(`rows must be >= 1, got ${rows}`);
  if (bytes.length === 0) throw new RangeError('refusing to transmit an empty payload');

  const base64 = Buffer.from(bytes).toString('base64');
  const commands: string[] = [];

  for (let offset = 0; offset < base64.length; offset += MAX_CHUNK_BASE64) {
    const chunk = base64.slice(offset, offset + MAX_CHUNK_BASE64);
    const isLast = offset + MAX_CHUNK_BASE64 >= base64.length;
    const more = isLast ? 0 : 1;

    if (offset === 0) {
      const control: GraphicsControl = { a: 'T' };
      if (unicodePlaceholder) control['U'] = 1;
      control['i'] = id;
      control['f'] = format;
      control['c'] = cols;
      control['r'] = rows;
      control['q'] = quiet;
      control['m'] = more;
      commands.push(buildGraphicsCommandBase64(control, chunk));
    } else {
      commands.push(buildGraphicsCommandBase64({ m: more, q: quiet }, chunk));
    }
  }

  return commands;
}

/**
 * Delete an image *and free its pixel data* (`a=d,d=I,i=<id>`).
 *
 * Uppercase `I` is required: lowercase `d=i` removes placements but leaks the decoded
 * image in the terminal's memory for the rest of the session. `d=I` is also one of the
 * few selectors that can delete a *virtual* placement (kitty: virtual placements "can be
 * deleted by a deletion command only when the `d` key is equal to i, I, r, R, n or N").
 */
export function deleteImage(id: number, quiet: 0 | 1 | 2 = 2): string {
  assertImageId(id);
  return buildGraphicsCommandBase64({ a: 'd', d: 'I', i: id, q: quiet });
}

/**
 * Delete every visible placement and free all image data (`a=d,d=A`).
 *
 * CAUTION: `d=A` does **not** remove virtual (Unicode-placeholder) placements — kitty
 * only honours `i/I/r/R/n/N` for those. Use it as a belt-and-braces sweep for real
 * placements; delete our own images with {@link deleteImage} per id.
 */
export function deleteAll(quiet: 0 | 1 | 2 = 2): string {
  return buildGraphicsCommandBase64({ a: 'd', d: 'A', q: quiet });
}

/**
 * Delete every image in an inclusive id range (`a=d,d=R,x=<from>,y=<to>`).
 *
 * Unlike {@link deleteAll} this selector *does* apply to virtual placements.
 */
export function deleteRange(from: number, to: number, quiet: 0 | 1 | 2 = 2): string {
  assertImageId(from);
  assertImageId(to);
  return buildGraphicsCommandBase64({ a: 'd', d: 'R', x: from, y: to, q: quiet });
}

/**
 * Build the `rows` x `cols` block of Unicode placeholder cells that displays image `id`.
 *
 * Every cell carries an explicit row diacritic AND an explicit column diacritic. The
 * protocol allows omitting them and inheriting from "the cell to the left", but Ink's
 * diff renderer rewrites partial lines and re-emits SGR mid-row, which breaks that
 * continuity assumption (research doc §2). Two extra combining marks per cell is cheap
 * and unconditionally correct.
 *
 * The image id is carried in the foreground colour as 24-bit RGB (`id = R<<16|G<<8|B`).
 * Ids above 0xFFFFFF additionally emit a third diacritic encoding the most significant
 * byte. Raw SGR is used rather than `<Text color>`: chalk's `\x1b[39m` reset would
 * terminate the colour run mid-grid and orphan the rest of the row.
 *
 * @returns one string per row: `ESC[38;2;R;G;Bm` + cells + `ESC[39m`. Each string
 *   measures exactly `cols` display columns (`stringWidth`), because U+10EEEE is width 1
 *   and combining marks are width 0.
 */
export function buildPlaceholderGrid(id: number, cols: number, rows: number): string[] {
  assertImageId(id);
  if (!Number.isInteger(cols) || cols <= 0) throw new RangeError(`cols must be >= 1, got ${cols}`);
  if (!Number.isInteger(rows) || rows <= 0) throw new RangeError(`rows must be >= 1, got ${rows}`);
  if (cols > MAX_PLACEHOLDER_INDEX + 1 || rows > MAX_PLACEHOLDER_INDEX + 1) {
    throw new RangeError(
      `placement of ${cols}x${rows} cells exceeds the ${MAX_PLACEHOLDER_INDEX + 1}-cell diacritic table`,
    );
  }

  const red = (id >>> 16) & 0xff;
  const green = (id >>> 8) & 0xff;
  const blue = id & 0xff;
  const mostSignificantByte = (id >>> 24) & 0xff;
  // The third diacritic is only emitted when the id genuinely needs 32 bits; emitting
  // index 0 unconditionally would be legal but doubles the churn Ink has to diff.
  const idHighDiacritic = mostSignificantByte === 0 ? '' : diacritic(mostSignificantByte);

  const foreground = `\x1b[38;2;${red};${green};${blue}m`;
  const reset = '\x1b[39m';

  const grid: string[] = [];
  for (let row = 0; row < rows; row++) {
    const rowDiacritic = diacritic(row);
    let line = foreground;
    for (let col = 0; col < cols; col++) {
      line += PLACEHOLDER + rowDiacritic + diacritic(col) + idHighDiacritic;
    }
    grid.push(line + reset);
  }
  return grid;
}

/**
 * A random, non-zero 24-bit image id.
 *
 * Image ids live in a namespace shared with every other program attached to the
 * terminal, so sequential ids starting at 1 reliably stomp another pane's images.
 * Staying inside 24 bits keeps the placeholder grid to two diacritics per cell.
 */
export function nextImageId(taken?: ReadonlySet<number>): number {
  for (;;) {
    const id = randomInt(1, MAX_24BIT_IMAGE_ID + 1);
    if (!taken?.has(id)) return id;
  }
}

/**
 * Wrap a sequence for tmux's `allow-passthrough` (doubling every ESC).
 *
 * Not used by default: `detectTerminalGraphics` reports tmux as unsupported unless
 * passthrough is known to be on. Kept here because it is pure and the fix is one call.
 */
export function wrapTmuxPassthrough(sequence: string): string {
  return `\x1bPtmux;${sequence.replaceAll('\x1b', '\x1b\x1b')}\x1b\\`;
}

function assertImageId(id: number): void {
  if (!Number.isInteger(id) || id <= 0 || id > MAX_IMAGE_ID) {
    throw new RangeError(`image id must be an integer in 1..${MAX_IMAGE_ID}, got ${id}`);
  }
}
