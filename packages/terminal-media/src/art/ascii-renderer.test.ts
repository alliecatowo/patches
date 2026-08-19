import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import { MediaTooLargeError, MAX_INPUT_BYTES } from '../limits.js';
import { AsciiRenderer, LUMINANCE_RAMP } from './ascii-renderer.js';

const CELL = { cellWidthPx: 10, cellHeightPx: 20 };

async function solidPng(
  width: number,
  height: number,
  gray: number,
  alpha?: number,
): Promise<Uint8Array> {
  const image = sharp({
    create: {
      width,
      height,
      channels: alpha === undefined ? 3 : 4,
      background:
        alpha === undefined
          ? { r: gray, g: gray, b: gray }
          : { r: gray, g: gray, b: gray, alpha: alpha / 255 },
    },
  }).png();
  return new Uint8Array(await image.toBuffer());
}

describe('AsciiRenderer', () => {
  let landscape: Uint8Array;

  beforeAll(async () => {
    landscape = await solidPng(400, 200, 128);
  });

  it('reports kind "ascii" and never emits ANSI codes', async () => {
    const renderer = new AsciiRenderer(CELL);
    expect(renderer.kind).toBe('ascii');
    const image = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    for (const row of renderer.placeholderRows(image)) {
      expect(row).not.toContain('\x1b');
    }
  });

  it('draws exactly cols display columns per row', async () => {
    for (const [maxCols, maxRows] of [
      [20, 10],
      [37, 15],
      [8, 4],
    ] as const) {
      const renderer = new AsciiRenderer(CELL);
      const image = await renderer.prepare(
        { bytes: landscape, mime: 'image/png' },
        { maxCols, maxRows },
      );
      const rows = renderer.placeholderRows(image);
      expect(rows).toHaveLength(image.rows);
      for (const row of rows) expect([...row]).toHaveLength(image.cols);
    }
  });

  it('renders a solid black image as blank space (darkest ramp glyph)', async () => {
    const renderer = new AsciiRenderer(CELL);
    const image = await renderer.prepare(
      { bytes: await solidPng(40, 40, 0), mime: 'image/png' },
      { maxCols: 10, maxRows: 5 },
    );
    for (const row of renderer.placeholderRows(image)) {
      expect(row).toBe(' '.repeat(image.cols));
    }
  });

  it('renders a solid white image as the densest ramp glyph', async () => {
    const renderer = new AsciiRenderer(CELL);
    const image = await renderer.prepare(
      { bytes: await solidPng(40, 40, 255), mime: 'image/png' },
      { maxCols: 10, maxRows: 5 },
    );
    const densest = LUMINANCE_RAMP.at(-1);
    for (const row of renderer.placeholderRows(image)) {
      expect(row).toBe((densest ?? '@').repeat(image.cols));
    }
  });

  it('renders a mid-grey image with a ramp character strictly between the extremes', async () => {
    const renderer = new AsciiRenderer(CELL);
    const image = await renderer.prepare(
      { bytes: await solidPng(40, 40, 128), mime: 'image/png' },
      { maxCols: 6, maxRows: 3 },
    );
    for (const row of renderer.placeholderRows(image)) {
      for (const char of row) {
        const index = LUMINANCE_RAMP.indexOf(char);
        expect(index).toBeGreaterThan(0);
        expect(index).toBeLessThan(LUMINANCE_RAMP.length - 1);
      }
    }
  });

  it('renders a fully transparent image as bare spaces', async () => {
    const renderer = new AsciiRenderer(CELL);
    const image = await renderer.prepare(
      { bytes: await solidPng(40, 40, 255, 0), mime: 'image/png' },
      { maxCols: 8, maxRows: 4 },
    );
    for (const row of renderer.placeholderRows(image)) {
      expect(row).toBe(' '.repeat(image.cols));
    }
  });

  it('reuses the cached render for identical bytes at the same size', async () => {
    const renderer = new AsciiRenderer(CELL);
    const first = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    const second = await renderer.prepare(
      { bytes: Uint8Array.from(landscape), mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    expect(second.id).toBe(first.id);
  });

  it('forgets a placement on release and every placement on releaseAll', async () => {
    const renderer = new AsciiRenderer(CELL);
    const image = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    renderer.release(image);
    expect(renderer.placeholderRows(image)).toEqual([]);

    const again = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    renderer.releaseAll();
    expect(renderer.placeholderRows(again)).toEqual([]);
  });

  it('rejects input over MAX_INPUT_BYTES before decoding it (spec §153)', async () => {
    const renderer = new AsciiRenderer(CELL);
    const oversized = new Uint8Array(MAX_INPUT_BYTES + 1);
    await expect(
      renderer.prepare({ bytes: oversized, mime: 'image/png' }, { maxCols: 20, maxRows: 10 }),
    ).rejects.toBeInstanceOf(MediaTooLargeError);
  });
});
