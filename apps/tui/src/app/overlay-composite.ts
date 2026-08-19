import sliceAnsi from 'slice-ansi';
import stringWidth from 'string-width';

/**
 * ANSI-safe overlay compositing (P12-022, `docs/architecture/tui-interaction-model.md` §3.3).
 *
 * Ink has no z-index, so a floating overlay has to be composited as *strings*: the
 * background is snapshotted once, dimmed, and sliced around the hole the overlay
 * occupies. The trap the architect's probe found is that `renderToString` does **not**
 * pad its lines to `columns`, so an un-padded background yields short rows next to
 * full-width overlaid ones — a width mismatch, which is exactly the §2.1 cause of the
 * smeared timeline. Padding to `columns` before slicing is therefore not optional, and
 * `assertRowWidths` makes it a checked invariant rather than a convention.
 *
 * Pure functions only: no React, no terminal. `Overlay.tsx` supplies the strings.
 */

const ESCAPE = '\u001B';
export const DIM_ON = `${ESCAPE}[2m`;
export const DIM_OFF = `${ESCAPE}[22m`;

function isParameterByte(char: string | undefined): boolean {
  if (char === undefined) return false;
  return char === ';' || (char >= '0' && char <= '9');
}

/**
 * Dims one already-rendered line.
 *
 * Naively wrapping the line in `ESC[2m … ESC[22m` does not work: Ink's own output
 * closes bold with `ESC[22m` and resets with `ESC[0m`, and both of those also cancel
 * dim — the line would go bright again after its first styled run. So dim is re-armed
 * immediately after *every* SGR sequence the line contains. Scanned by code point
 * rather than with a regular expression, the same way `format/sanitize.ts` does, since
 * a control character in a regex literal trips `no-control-regex`.
 */
export function dimLine(line: string): string {
  let out = DIM_ON;
  let index = 0;
  while (index < line.length) {
    if (line[index] !== ESCAPE || line[index + 1] !== '[') {
      out += line[index];
      index += 1;
      continue;
    }
    let scan = index + 2;
    while (isParameterByte(line[scan])) scan += 1;
    if (line[scan] === 'm') {
      out += line.slice(index, scan + 1) + DIM_ON;
      index = scan + 1;
      continue;
    }
    out += line[index];
    index += 1;
  }
  return `${out}${DIM_OFF}`;
}

/** Pads (or ANSI-safely truncates) one line to exactly `columns` terminal cells. */
export function fitLine(line: string, columns: number): string {
  if (columns <= 0) return '';
  const width = stringWidth(line);
  if (width === columns) return line;
  if (width < columns) return line + ' '.repeat(columns - width);
  const sliced = sliceAnsi(line, 0, columns);
  const slicedWidth = stringWidth(sliced);
  // A double-width glyph straddling the cut leaves one cell short; pad it back.
  return slicedWidth < columns ? sliced + ' '.repeat(columns - slicedWidth) : sliced;
}

/**
 * Turns a `renderToString` snapshot into exactly `rows` lines of exactly `columns`
 * cells — the padded, rectangular background every later slice depends on.
 */
export function toRectangle(snapshot: string, columns: number, rows: number): string[] {
  const lines = snapshot === '' ? [] : snapshot.split('\n');
  const blank = ' '.repeat(Math.max(0, columns));
  return Array.from({ length: Math.max(0, rows) }, (_, index) => {
    const line = lines[index];
    return line === undefined ? blank : fitLine(line, columns);
  });
}

export interface OverlayPlacement {
  top: number;
  left: number;
  overlayColumns: number;
  overlayRows: number;
}

/** Centres an overlay of the given size inside the content region, clamped inside it. */
export function placeOverlay(
  columns: number,
  rows: number,
  overlayColumns: number,
  overlayRows: number,
): OverlayPlacement {
  const width = Math.max(0, Math.min(overlayColumns, columns));
  const height = Math.max(0, Math.min(overlayRows, rows));
  return {
    overlayColumns: width,
    overlayRows: height,
    left: Math.max(0, Math.floor((columns - width) / 2)),
    top: Math.max(0, Math.floor((rows - height) / 2)),
  };
}

export interface CompositedBackground {
  /** Full-width rows above the overlay. */
  above: string[];
  /** The overlay band's left gutter, one entry per overlay row. */
  left: string[];
  /** The overlay band's right gutter, one entry per overlay row. */
  right: string[];
  /** Full-width rows below the overlay. */
  below: string[];
}

/**
 * Splices a rectangular hole for the overlay out of a dimmed background.
 *
 * The overlay itself is *not* composited in: it stays a live Ink subtree so it can own
 * input and state, and is laid out between the two gutters. That is the one deviation
 * from the design note's "splice the overlay's `renderToString` output in", and it is
 * the deviation that makes an interactive overlay (quick post, palette, confirm)
 * possible at all — a `renderToString`ed overlay is frozen and cannot receive keys.
 */
export function compositeBackground(
  background: readonly string[],
  placement: OverlayPlacement,
  columns: number,
): CompositedBackground {
  const { top, left, overlayColumns, overlayRows } = placement;
  const rightStart = left + overlayColumns;
  const above: string[] = [];
  const leftGutter: string[] = [];
  const rightGutter: string[] = [];
  const below: string[] = [];

  for (const [index, row] of background.entries()) {
    const dimmed = dimLine(row);
    if (index < top) {
      above.push(dimmed);
      continue;
    }
    if (index >= top + overlayRows) {
      below.push(dimmed);
      continue;
    }
    leftGutter.push(left === 0 ? '' : fitLine(dimLine(sliceAnsi(row, 0, left)), left));
    rightGutter.push(
      rightStart >= columns
        ? ''
        : fitLine(dimLine(sliceAnsi(row, rightStart, columns)), columns - rightStart),
    );
  }

  return { above, left: leftGutter, right: rightGutter, below };
}

/**
 * The checked frame invariant: every composited row is exactly `columns` cells wide.
 * Returns the offending rows so a test can name them.
 */
export function assertRowWidths(rows: readonly string[], columns: number): readonly string[] {
  return rows.filter((row) => stringWidth(row) !== columns);
}
