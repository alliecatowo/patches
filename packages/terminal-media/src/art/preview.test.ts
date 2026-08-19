import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { renderArtPreview } from './preview.js';

async function solidPng(width: number, height: number): Promise<Uint8Array> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 200, b: 40 } },
  }).png();
  return new Uint8Array(await image.toBuffer());
}

describe('renderArtPreview', () => {
  it('returns rows of exactly the requested column budget', async () => {
    const bytes = await solidPng(200, 100);
    const rows = await renderArtPreview(bytes, {
      cols: 12,
      rows: 6,
      mode: 'ascii',
      env: {},
    });
    for (const row of rows) expect([...row]).toHaveLength(12);
  });

  it('mode "box" renders the spec §75 description box, not art', async () => {
    const bytes = await solidPng(200, 100);
    const rows = await renderArtPreview(bytes, { cols: 30, rows: 3, mode: 'box' });
    expect(rows.some((row) => row.includes('image ·'))).toBe(true);
  });

  it('mode "off" renders the same box as "box"', async () => {
    const bytes = await solidPng(200, 100);
    const rows = await renderArtPreview(bytes, { cols: 30, rows: 3, mode: 'off' });
    expect(rows.some((row) => row.includes('image ·'))).toBe(true);
  });

  it('mode "ascii" never emits ANSI colour codes', async () => {
    const bytes = await solidPng(200, 100);
    const rows = await renderArtPreview(bytes, { cols: 12, rows: 6, mode: 'ascii' });
    expect(rows.some((row) => row.includes('\x1b'))).toBe(false);
  });

  it('mode "pixel"/"auto"/"kitty" all render half-block art with colour when available', async () => {
    const bytes = await solidPng(20, 40);
    const truecolorEnv = { COLORTERM: 'truecolor' };
    for (const mode of ['pixel', 'auto', 'kitty'] as const) {
      const rows = await renderArtPreview(bytes, {
        cols: 4,
        rows: 2,
        mode,
        env: truecolorEnv,
      });
      expect(rows.some((row) => row.includes('\x1b[38;2;'))).toBe(true);
    }
  });

  it('degrades to ascii under NO_COLOR even in pixel mode', async () => {
    const bytes = await solidPng(20, 40);
    const rows = await renderArtPreview(bytes, {
      cols: 4,
      rows: 2,
      mode: 'pixel',
      env: { NO_COLOR: '1' },
    });
    expect(rows.some((row) => row.includes('\x1b'))).toBe(false);
  });
});
