/**
 * The scrolling viewport: which rows of a variable-height list actually get
 * rendered, given a fixed row budget.
 *
 * Pure functions so the invariant ("never emit more rows than the terminal has")
 * can be unit-tested without a terminal. Ink smears the whole screen the moment a
 * frame is taller than the window (see `format/measure.ts`), so this is the shell's
 * single most important piece of arithmetic.
 */

export interface Viewport {
  /** First rendered index. */
  start: number;
  /** One past the last rendered index. */
  end: number;
  /** Rows consumed by `start..end`. */
  height: number;
  /** Items above `start`. */
  above: number;
  /** Items below `end`. */
  below: number;
}

/**
 * Where the window should start, keeping `selected` fully visible while moving as
 * little as possible — a list that re-centres on every keypress is unreadable.
 *
 * `desiredTop` is the window's last position; the result is derived from it rather
 * than written back from an effect.
 */
export function resolveTopIndex(
  desiredTop: number,
  selected: number,
  heights: readonly number[],
  budget: number,
): number {
  if (heights.length === 0) return 0;
  const maxIndex = heights.length - 1;
  const target = Math.min(Math.max(selected, 0), maxIndex);
  let top = Math.min(Math.max(desiredTop, 0), target);

  // Scroll down just far enough that `target` fits inside the budget.
  let used = 0;
  for (let index = top; index <= target; index += 1) used += heights[index] ?? 0;
  while (top < target && used > budget) {
    used -= heights[top] ?? 0;
    top += 1;
  }
  return top;
}

/** The rows that fit, starting at `top`. Always renders at least one item, even when
 * that single item is taller than the whole budget — the surrounding `Box` clips it. */
export function computeViewport(top: number, heights: readonly number[], budget: number): Viewport {
  if (heights.length === 0) return { start: 0, end: 0, height: 0, above: 0, below: 0 };
  const start = Math.min(Math.max(top, 0), heights.length - 1);
  let end = start;
  let height = 0;
  while (end < heights.length) {
    const next = heights[end] ?? 0;
    if (end > start && height + next > budget) break;
    height += next;
    end += 1;
  }
  return {
    start,
    end,
    height,
    above: start,
    below: heights.length - end,
  };
}
