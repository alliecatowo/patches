import stringWidth from 'string-width';
import { describe, expect, it } from 'vitest';

import {
  assertRowWidths,
  compositeBackground,
  DIM_OFF,
  DIM_ON,
  dimLine,
  fitLine,
  placeOverlay,
  toRectangle,
} from './overlay-composite.js';

const ESC = '\u001B';

function strip(value: string): string {
  return value.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, 'gu'), '');
}

describe('fitLine / toRectangle', () => {
  it('pads a short line to exactly the column budget', () => {
    expect(fitLine('abc', 6)).toBe('abc   ');
    expect(stringWidth(fitLine('abc', 6))).toBe(6);
  });

  it('truncates a long line without cutting an escape sequence in half', () => {
    const coloured = `${ESC}[31mhello${ESC}[39m world`;
    const cut = fitLine(coloured, 7);
    expect(stringWidth(cut)).toBe(7);
    expect(strip(cut)).toBe('hello w');
  });

  it('pads back the cell a straddled double-width glyph would have left short', () => {
    // '日本語' is 6 cells; slicing at 5 lands mid-glyph.
    expect(stringWidth(fitLine('日本語', 5))).toBe(5);
  });

  it('turns an unpadded renderToString snapshot into an exact rectangle', () => {
    const rectangle = toRectangle('one\ntwo', 8, 4);
    expect(rectangle).toHaveLength(4);
    for (const row of rectangle) expect(stringWidth(row)).toBe(8);
    expect(rectangle[3]).toBe('        ');
  });
});

describe('dimLine', () => {
  it('re-arms dim after every SGR sequence, so a bold run does not cancel it', () => {
    // `ESC[22m` closes bold — and also closes dim, which is the trap.
    const line = `plain ${ESC}[1mbold${ESC}[22m tail`;
    const dimmed = dimLine(line);
    expect(dimmed.startsWith(DIM_ON)).toBe(true);
    expect(dimmed.endsWith(DIM_OFF)).toBe(true);
    expect(dimmed).toContain(`${ESC}[22m${DIM_ON}`);
    expect(strip(dimmed)).toBe(strip(line));
  });

  it('never changes the visible width of a line', () => {
    const line = `${ESC}[35m@alice${ESC}[39m posted`;
    expect(stringWidth(dimLine(line))).toBe(stringWidth(line));
  });
});

describe('compositeBackground', () => {
  const columns = 20;
  const rows = 6;
  const background = toRectangle(
    Array.from({ length: rows }, () => 'x'.repeat(20)).join('\n'),
    columns,
    rows,
  );

  it('centres the overlay inside the region', () => {
    expect(placeOverlay(20, 6, 10, 2)).toEqual({
      overlayColumns: 10,
      overlayRows: 2,
      left: 5,
      top: 2,
    });
  });

  it('clamps an overlay bigger than the region rather than overflowing the frame', () => {
    expect(placeOverlay(20, 6, 40, 12)).toEqual({
      overlayColumns: 20,
      overlayRows: 6,
      left: 0,
      top: 0,
    });
  });

  it('splices a hole whose gutters plus the overlay are exactly the column budget', () => {
    const placement = placeOverlay(columns, rows, 10, 2);
    const composited = compositeBackground(background, placement, columns);

    expect(composited.above).toHaveLength(placement.top);
    expect(composited.below).toHaveLength(rows - placement.top - placement.overlayRows);
    expect(composited.left).toHaveLength(placement.overlayRows);
    expect(composited.right).toHaveLength(placement.overlayRows);

    expect(assertRowWidths(composited.above, columns)).toEqual([]);
    expect(assertRowWidths(composited.below, columns)).toEqual([]);
    for (const [index, left] of composited.left.entries()) {
      const right = composited.right[index] ?? '';
      expect(
        stringWidth(left) + placement.overlayColumns + stringWidth(right),
        `composited row ${String(index)} is not ${String(columns)} cells`,
      ).toBe(columns);
    }
  });

  it('keeps the invariant when the overlay is flush against both edges', () => {
    const placement = placeOverlay(columns, rows, columns, rows);
    const composited = compositeBackground(background, placement, columns);
    expect(composited.above).toEqual([]);
    expect(composited.below).toEqual([]);
    expect(composited.left.every((row) => row === '')).toBe(true);
    expect(composited.right.every((row) => row === '')).toBe(true);
  });

  it('preserves colour runs on both sides of the hole', () => {
    const coloured = toRectangle(
      `${ESC}[31m${'a'.repeat(20)}${ESC}[39m\n${'b'.repeat(20)}`,
      columns,
      2,
    );
    const composited = compositeBackground(coloured, placeOverlay(columns, 2, 10, 2), columns);
    expect(strip(composited.left[0] ?? '')).toBe('aaaaa');
    expect(strip(composited.right[0] ?? '')).toBe('aaaaa');
    expect(composited.left[0]).toContain(`${ESC}[31m`);
  });
});
