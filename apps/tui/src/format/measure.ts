import stringWidth from 'string-width';

/**
 * Terminal-cell measurement, for the shell's fixed layout.
 *
 * Ink diffs frames line by line. If a frame is taller than the terminal — or a line
 * is wider than `columns` and soft-wraps into an extra row — its bookkeeping goes off
 * by one and every later re-render smears: counts lines drawn over the previous post's
 * header, bodies cut mid-word, the status bar wrapped onto a second line. That is the
 * corruption the owner hit on a long Home timeline (2026-08-18). The fix is to never
 * emit a frame that doesn't fit, which means measuring before rendering.
 *
 * `string-width` (the same package Ink itself uses) is used for every measurement —
 * `String.length` is wrong for emoji, CJK and combining marks, which is the other
 * classic source of an off-by-one wrap.
 */

/** Display width in terminal cells (emoji/CJK aware). */
export function cellWidth(text: string): number {
  return stringWidth(text);
}

/**
 * How many terminal rows `text` occupies when Ink soft-wraps it into `width`
 * columns. Greedy word wrap with mid-word breaking for over-long words, matching
 * `wrap-ansi`'s default (`hard: false` still breaks words longer than the width).
 *
 * Deliberately never returns less than the true count: under-measuring is what
 * produces an overflowing frame.
 */
export function wrappedRowCount(text: string, width: number): number {
  if (width <= 0) return 1;
  let rows = 0;
  for (const paragraph of text.split('\n')) {
    rows += wrapParagraph(paragraph, width);
  }
  return Math.max(1, rows);
}

function wrapParagraph(paragraph: string, width: number): number {
  if (paragraph === '') return 1;
  let rows = 1;
  let used = 0;
  for (const word of paragraph.split(' ')) {
    const wordWidth = cellWidth(word);
    if (wordWidth > width) {
      // A single word longer than the line is broken mid-word.
      if (used > 0) rows += 1;
      rows += Math.ceil(wordWidth / width) - 1;
      const remainder = wordWidth % width;
      used = remainder === 0 ? width : remainder;
    } else {
      const needed = used === 0 ? wordWidth : used + 1 + wordWidth;
      if (needed > width) {
        rows += 1;
        used = wordWidth;
      } else {
        used = needed;
      }
    }
  }
  return rows;
}

/** Hard-clips `text` to `width` cells, appending `…` when anything was dropped. */
export function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return '';
  if (cellWidth(text) <= width) return text;
  const budget = width - 1;
  let out = '';
  for (const char of text) {
    if (cellWidth(out + char) > budget) break;
    out += char;
  }
  return `${out}…`;
}

/**
 * Joins hint labels with ` · `, dropping the lowest-priority ones (the tail) until
 * the line fits. `hintsFor` already orders them most-useful-first, so the screen's
 * own keys survive and `? help` is the first thing to go.
 */
export function fitHints(hints: readonly string[], width: number): string {
  const separator = ' · ';
  let line = '';
  for (const hint of hints) {
    const candidate = line === '' ? hint : `${line}${separator}${hint}`;
    if (cellWidth(candidate) > width) break;
    line = candidate;
  }
  return line === '' ? truncateToWidth(hints[0] ?? '', width) : line;
}
