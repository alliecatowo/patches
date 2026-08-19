import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import { MediaTooLargeError, MAX_INPUT_BYTES } from '../limits.js';
import { HalfBlockRenderer } from './halfblock-renderer.js';

const CELL = { cellWidthPx: 10, cellHeightPx: 20 };

/** Strips ANSI SGR sequences (`\x1b[...m`) by hand, matching the house style in
 * `detect.ts` — a regex with a literal ESC trips `no-control-regex`. */
function stripSgr(text: string): string {
  let result = '';
  let index = 0;
  while (index < text.length) {
    if (text[index] === '\x1b' && text[index + 1] === '[') {
      let cursor = index + 2;
      while (cursor < text.length && text[cursor] !== 'm') cursor += 1;
      index = cursor + 1;
      continue;
    }
    result += text[index];
    index += 1;
  }
  return result;
}

async function solidPng(
  width: number,
  height: number,
  red = 200,
  alpha?: number,
): Promise<Uint8Array> {
  const image = sharp({
    create: {
      width,
      height,
      channels: alpha === undefined ? 3 : 4,
      background:
        alpha === undefined
          ? { r: red, g: 30, b: 90 }
          : { r: red, g: 30, b: 90, alpha: alpha / 255 },
    },
  }).png();
  return new Uint8Array(await image.toBuffer());
}

describe('HalfBlockRenderer', () => {
  let landscape: Uint8Array;

  beforeAll(async () => {
    landscape = await solidPng(400, 200);
  });

  it('reports kind "halfblock"', () => {
    expect(new HalfBlockRenderer(CELL).kind).toBe('halfblock');
  });

  it('draws exactly cols display columns per row, ANSI codes stripped', async () => {
    for (const [maxCols, maxRows] of [
      [20, 10],
      [37, 15],
      [8, 4],
    ] as const) {
      const renderer = new HalfBlockRenderer(CELL);
      const image = await renderer.prepare(
        { bytes: landscape, mime: 'image/png' },
        { maxCols, maxRows },
      );
      const rows = renderer.placeholderRows(image);
      expect(rows).toHaveLength(image.rows);
      for (const row of rows) {
        expect([...stripSgr(row)]).toHaveLength(image.cols);
      }
    }
  });

  it('fits the image inside the cell budget and preserves aspect ratio, like Kitty', async () => {
    const renderer = new HalfBlockRenderer(CELL);
    const image = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    expect(image.widthPx).toBe(200);
    expect(image.heightPx).toBe(100);
    expect(image.cols).toBe(20);
    expect(image.rows).toBe(5);
  });

  it('emits truecolor SGR for the top/bottom pixel colours by default', async () => {
    const renderer = new HalfBlockRenderer(CELL, 'truecolor');
    const image = await renderer.prepare(
      { bytes: await solidPng(10, 20, 200), mime: 'image/png' },
      { maxCols: 4, maxRows: 1 },
    );
    const [row] = renderer.placeholderRows(image);
    expect(row).toContain('\x1b[38;2;200;30;90m');
    expect(row).toContain('\x1b[48;2;200;30;90m');
    expect(row).toContain('▀');
  });

  it('degrades to the 256-colour cube when constructed with "256" support', async () => {
    const renderer = new HalfBlockRenderer(CELL, '256');
    const image = await renderer.prepare(
      { bytes: await solidPng(10, 20, 0), mime: 'image/png' },
      { maxCols: 4, maxRows: 1 },
    );
    const [row] = renderer.placeholderRows(image);
    expect(row).not.toContain('38;2;');
    expect(row).toMatch(/38;5;\d+m/);
  });

  it('renders a fully transparent image as bare spaces with reset colours', async () => {
    const renderer = new HalfBlockRenderer(CELL);
    const image = await renderer.prepare(
      { bytes: await solidPng(20, 40, 200, 0), mime: 'image/png' },
      { maxCols: 6, maxRows: 2 },
    );
    const rows = renderer.placeholderRows(image);
    for (const row of rows) {
      expect(stripSgr(row)).toBe(' '.repeat(image.cols));
      expect(row).not.toContain('▀');
      expect(row).not.toContain('▄');
    }
  });

  it('reuses the cached render for identical bytes at the same size', async () => {
    const renderer = new HalfBlockRenderer(CELL);
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
    const renderer = new HalfBlockRenderer(CELL);
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
    const renderer = new HalfBlockRenderer(CELL);
    const oversized = new Uint8Array(MAX_INPUT_BYTES + 1);
    await expect(
      renderer.prepare({ bytes: oversized, mime: 'image/png' }, { maxCols: 20, maxRows: 10 }),
    ).rejects.toBeInstanceOf(MediaTooLargeError);
  });
});
