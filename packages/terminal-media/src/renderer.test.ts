import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import type { GraphicsCapabilities } from './detect.js';
import { PLACEHOLDER } from './protocol/kitty.js';
import {
  FallbackMediaRenderer,
  KittyGraphicsRenderer,
  buildFallbackBox,
  createRenderer,
  MAX_INPUT_BYTES,
  MediaTooLargeError,
  type MediaStdout,
} from './renderer.js';

const ESC = '\x1b';

const KITTY_CAPS: GraphicsCapabilities = {
  kitty: true,
  cellWidthPx: 10,
  cellHeightPx: 20,
  columns: 120,
  rows: 40,
  termHint: 'test',
};

/** Collects everything the renderer writes so we can assert on the exact byte stream. */
class RecordingStdout implements MediaStdout {
  readonly writes: string[] = [];
  write = (data: string): boolean => {
    this.writes.push(data);
    return true;
  };
  get all(): string {
    return this.writes.join('');
  }
}

async function solidPng(width: number, height: number, red = 200): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: red, g: 30, b: 90 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

describe('KittyGraphicsRenderer', () => {
  let landscape: Uint8Array;
  let portrait: Uint8Array;

  beforeAll(async () => {
    landscape = await solidPng(400, 200);
    portrait = await solidPng(200, 400, 20);
  });

  it('transmits an a=T,U=1 virtual placement on prepare', async () => {
    const stdout = new RecordingStdout();
    const renderer = new KittyGraphicsRenderer(stdout, KITTY_CAPS);
    const image = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );

    expect(renderer.kind).toBe('kitty');
    expect(stdout.writes).toHaveLength(1);
    expect(
      stdout.all.startsWith(
        `${ESC}_Ga=T,U=1,i=${image.id},f=100,c=${image.cols},r=${image.rows},q=2,m=`,
      ),
    ).toBe(true);
    expect(stdout.all.endsWith(`${ESC}\\`)).toBe(true);
    expect(image.id).toBeGreaterThan(0);
  });

  it('fits the image inside the cell budget and preserves aspect ratio', async () => {
    const stdout = new RecordingStdout();
    const renderer = new KittyGraphicsRenderer(stdout, KITTY_CAPS);

    // 400x200 px into 20x10 cells of 10x20px = a 200x200px box -> width-limited.
    const wide = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    expect(wide.widthPx).toBe(200);
    expect(wide.heightPx).toBe(100);
    expect(wide.cols).toBe(20);
    expect(wide.rows).toBe(5);

    // 200x400 px into the same box -> height-limited.
    const tall = await renderer.prepare(
      { bytes: portrait, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    expect(tall.heightPx).toBe(200);
    expect(tall.widthPx).toBe(100);
    expect(tall.rows).toBe(10);
    expect(tall.cols).toBe(10);
  });

  it('never enlarges a small image or exceeds the budget', async () => {
    const stdout = new RecordingStdout();
    const renderer = new KittyGraphicsRenderer(stdout, KITTY_CAPS);
    const tiny = await renderer.prepare(
      { bytes: await solidPng(15, 15), mime: 'image/png' },
      { maxCols: 40, maxRows: 40 },
    );
    expect(tiny.widthPx).toBe(15);
    expect(tiny.cols).toBe(2); // ceil(15 / 10)
    expect(tiny.rows).toBe(1); // ceil(15 / 20)
  });

  it('falls back to a 10x20 cell when the terminal never reported one', async () => {
    const stdout = new RecordingStdout();
    const renderer = new KittyGraphicsRenderer(stdout, {});
    const image = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    expect(image.widthPx).toBe(200);
  });

  it('reuses the id for identical bytes in the same box, without re-transmitting', async () => {
    const stdout = new RecordingStdout();
    const renderer = new KittyGraphicsRenderer(stdout, KITTY_CAPS);
    const first = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    const second = await renderer.prepare(
      { bytes: Uint8Array.from(landscape), mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    expect(second.id).toBe(first.id);
    expect(stdout.writes).toHaveLength(1);
  });

  it('releases the old placement when the same image is re-prepared at a new size', async () => {
    const stdout = new RecordingStdout();
    const renderer = new KittyGraphicsRenderer(stdout, KITTY_CAPS);
    const first = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    const resized = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 30, maxRows: 10 },
    );
    expect(resized.id).not.toBe(first.id);
    expect(stdout.all).toContain(`${ESC}_Ga=d,d=I,i=${first.id},q=2${ESC}\\`);
  });

  it('builds placeholder rows sized to the placement', async () => {
    const stdout = new RecordingStdout();
    const renderer = new KittyGraphicsRenderer(stdout, KITTY_CAPS);
    const image = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    const rows = renderer.placeholderRows(image);
    expect(rows).toHaveLength(image.rows);
    for (const row of rows) {
      // PLACEHOLDER is a unique codepoint, so counting it needs no SGR stripping.
      expect([...row].filter((char) => char === PLACEHOLDER)).toHaveLength(image.cols);
    }
  });

  it('frees image data with the uppercase delete selector, exactly once', async () => {
    const stdout = new RecordingStdout();
    const renderer = new KittyGraphicsRenderer(stdout, KITTY_CAPS);
    const image = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    renderer.release(image);
    renderer.release(image);
    const deletes = stdout.all.split(`${ESC}_Ga=d,d=I,i=${image.id},q=2${ESC}\\`).length - 1;
    expect(deletes).toBe(1);
  });

  it('releaseAll deletes every live image per id (d=A cannot touch virtual placements)', async () => {
    const stdout = new RecordingStdout();
    const renderer = new KittyGraphicsRenderer(stdout, KITTY_CAPS);
    const a = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    const b = await renderer.prepare(
      { bytes: portrait, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    stdout.writes.length = 0;
    renderer.releaseAll();
    expect(stdout.all).toContain(`i=${a.id},q=2`);
    expect(stdout.all).toContain(`i=${b.id},q=2`);
    expect(stdout.all).not.toContain('d=A');

    stdout.writes.length = 0;
    renderer.releaseAll();
    expect(stdout.writes).toHaveLength(0);
  });

  it('re-transmits after releaseAll rather than serving a stale cache entry', async () => {
    const stdout = new RecordingStdout();
    const renderer = new KittyGraphicsRenderer(stdout, KITTY_CAPS);
    const first = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    renderer.releaseAll();
    const second = await renderer.prepare(
      { bytes: landscape, mime: 'image/png' },
      { maxCols: 20, maxRows: 10 },
    );
    expect(second.id).not.toBe(first.id);
  });
});

describe('FallbackMediaRenderer', () => {
  it('reports real pixel dimensions from metadata without decoding pixels', async () => {
    const renderer = new FallbackMediaRenderer();
    const image = await renderer.prepare(
      { bytes: await solidPng(1600, 1067), mime: 'image/jpeg' },
      { maxCols: 40, maxRows: 10 },
    );
    expect(renderer.kind).toBe('fallback');
    expect(image.widthPx).toBe(1600);
    expect(image.heightPx).toBe(1067);
    expect(image.rows).toBe(3);
    expect(image.cols).toBe(40);
  });

  it('renders the spec §75 box', async () => {
    const renderer = new FallbackMediaRenderer();
    const image = await renderer.prepare(
      { bytes: await solidPng(1600, 1067), mime: 'image/png' },
      { maxCols: 38, maxRows: 10 },
    );
    const rows = renderer.placeholderRows(image);
    expect(rows).toEqual([
      '┌ image · 1600×1067 · png ───────────┐',
      '│ press o to open externally         │',
      '└────────────────────────────────────┘',
    ]);
    expect(rows.every((row) => [...row].length === 38)).toBe(true);
  });

  it('survives undecodable bytes', async () => {
    const renderer = new FallbackMediaRenderer();
    const image = await renderer.prepare(
      { bytes: new Uint8Array([1, 2, 3, 4]), mime: 'image/webp' },
      { maxCols: 30, maxRows: 3 },
    );
    expect(image.widthPx).toBe(0);
    expect(renderer.placeholderRows(image)[0]).toContain('unknown size');
  });

  it('forgets images on release', async () => {
    const renderer = new FallbackMediaRenderer();
    const image = await renderer.prepare(
      { bytes: await solidPng(10, 10), mime: 'image/png' },
      { maxCols: 30, maxRows: 3 },
    );
    renderer.release(image);
    renderer.releaseAll();
    expect(renderer.placeholderRows(image)[0]).toContain('image');
  });
});

describe('buildFallbackBox', () => {
  it('always returns rows of exactly the requested width', () => {
    for (const cols of [8, 12, 20, 60, 120]) {
      for (const row of buildFallbackBox(cols, 'image · 1600×1067 · jpeg')) {
        expect([...row]).toHaveLength(cols);
      }
    }
  });

  it('truncates rather than overflowing a narrow box', () => {
    const rows = buildFallbackBox(12, 'image · 1600×1067 · jpeg');
    expect(rows[0]).toBe('┌ image · 1┐');
    expect([...(rows[1] ?? '')]).toHaveLength(12);
  });
});

describe('createRenderer', () => {
  it('picks kitty only when the probe said yes', () => {
    const stdout = new RecordingStdout();
    expect(createRenderer(KITTY_CAPS, stdout).kind).toBe('kitty');
    expect(createRenderer({ ...KITTY_CAPS, kitty: false }, stdout).kind).toBe('fallback');
  });
});

describe('bounded input (spec §153)', () => {
  const oversized: Uint8Array = new Uint8Array(MAX_INPUT_BYTES + 1);

  it('KittyGraphicsRenderer rejects input over MAX_INPUT_BYTES before decoding it', async () => {
    const renderer = new KittyGraphicsRenderer(new RecordingStdout(), KITTY_CAPS);
    await expect(
      renderer.prepare({ bytes: oversized, mime: 'image/png' }, { maxCols: 20, maxRows: 10 }),
    ).rejects.toBeInstanceOf(MediaTooLargeError);
  });

  it('FallbackMediaRenderer rejects input over MAX_INPUT_BYTES before decoding it', async () => {
    const renderer = new FallbackMediaRenderer();
    await expect(
      renderer.prepare({ bytes: oversized, mime: 'image/png' }, { maxCols: 20, maxRows: 3 }),
    ).rejects.toBeInstanceOf(MediaTooLargeError);
  });

  it('accepts a normal image well under MAX_INPUT_BYTES', async () => {
    const renderer = new FallbackMediaRenderer();
    const bytes = await solidPng(10, 10);
    expect(bytes.byteLength).toBeLessThan(MAX_INPUT_BYTES);
    await expect(
      renderer.prepare({ bytes, mime: 'image/png' }, { maxCols: 20, maxRows: 3 }),
    ).resolves.toBeDefined();
  });
});
