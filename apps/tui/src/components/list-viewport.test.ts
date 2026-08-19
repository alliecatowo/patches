import { describe, expect, it } from 'vitest';

import { computeViewport, resolveTopIndex } from './list-viewport.js';

/** Ten rows, four terminal lines each. */
const heights = Array.from({ length: 10 }, () => 4);

describe('list viewport', () => {
  it('never renders more rows than the budget', () => {
    const viewport = computeViewport(0, heights, 10);
    expect(viewport.height).toBeLessThanOrEqual(10);
    expect(viewport.end - viewport.start).toBe(2);
    expect(viewport.below).toBe(8);
  });

  it('renders at least one item even when it alone overflows', () => {
    const viewport = computeViewport(0, [30], 10);
    expect(viewport.end - viewport.start).toBe(1);
  });

  it('scrolls only as far as it must to keep the selection visible', () => {
    // Budget 12 = three rows. Selecting row 2 from top 0 needs no scroll.
    expect(resolveTopIndex(0, 2, heights, 12)).toBe(0);
    // Row 3 does not fit from 0, so the window advances by exactly one.
    expect(resolveTopIndex(0, 3, heights, 12)).toBe(1);
    // Moving back up above the window pulls the top with it.
    expect(resolveTopIndex(5, 2, heights, 12)).toBe(2);
  });

  it('reports how much is off screen in each direction', () => {
    const top = resolveTopIndex(0, 9, heights, 12);
    const viewport = computeViewport(top, heights, 12);
    expect(viewport.above).toBe(7);
    expect(viewport.below).toBe(0);
  });

  it('copes with variable row heights', () => {
    const mixed = [2, 12, 3, 3, 3];
    const viewport = computeViewport(0, mixed, 10);
    // Row 0 (2) fits; row 1 (12) would blow the budget, so it stops.
    expect(viewport.end).toBe(1);
    // Selecting the tall row scrolls to it.
    expect(resolveTopIndex(0, 1, mixed, 10)).toBe(1);
  });

  it('is a no-op for an empty list', () => {
    expect(computeViewport(0, [], 10)).toEqual({
      start: 0,
      end: 0,
      height: 0,
      above: 0,
      below: 0,
    });
    expect(resolveTopIndex(3, 0, [], 10)).toBe(0);
  });
});
