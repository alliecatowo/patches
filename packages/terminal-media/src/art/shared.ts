/**
 * Pixel decoding shared by both art renderers (`half-block-renderer.ts`,
 * `ascii-renderer.ts`): fit the source image into a cell budget exactly the way
 * `KittyGraphicsRenderer` does (aspect-preserved, never enlarged), then sample it down
 * to the exact sub-cell pixel grid each renderer draws from.
 */
import sharp from 'sharp';

import { assertBoundedInput, clamp, SHARP_INPUT_LIMITS } from '../limits.js';

/** Largest art placement we'll ever compute, regardless of the caller's cell budget —
 * a full-screen terminal is nowhere near this, so this only bounds a pathological
 * `maxCols`/`maxRows` from a misbehaving caller. */
export const MAX_ART_COLS = 200;
export const MAX_ART_ROWS = 100;

export interface ArtCellGeometry {
  cellWidthPx: number;
  cellHeightPx: number;
}

export interface ArtGrid {
  cols: number;
  rows: number;
  /** The (possibly downscaled) image size in pixels, after aspect-preserving fit. */
  widthPx: number;
  heightPx: number;
}

/**
 * Cols/rows an image should occupy, computed the same way `KittyGraphicsRenderer`
 * does: resize-to-fit inside `maxCols x maxRows` cells (using the terminal's real or
 * assumed cell pixel size), preserving aspect ratio, never enlarging — then read back
 * the resulting pixel size to derive the cell grid.
 */
export async function computeArtGrid(
  bytes: Uint8Array,
  maxCols: number,
  maxRows: number,
  cell: ArtCellGeometry,
): Promise<ArtGrid> {
  assertBoundedInput(bytes);
  const { info } = await sharp(bytes, SHARP_INPUT_LIMITS)
    .rotate()
    .resize({
      width: Math.max(1, maxCols) * cell.cellWidthPx,
      height: Math.max(1, maxRows) * cell.cellHeightPx,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const cols = clamp(Math.ceil(info.width / cell.cellWidthPx), 1, Math.max(1, maxCols));
  const rows = clamp(Math.ceil(info.height / cell.cellHeightPx), 1, Math.max(1, maxRows));
  return { cols, rows, widthPx: info.width, heightPx: info.height };
}

export interface SampledImage {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes/pixel (`ensureAlpha()`'d even for an opaque source, so
   * every pixel can be read uniformly). */
  data: Buffer;
}

/**
 * Resample the source image to an exact `sampleWidth x sampleHeight` pixel grid — one
 * sample per sub-cell dot/half a renderer draws. `fit: 'fill'` (stretch exactly, no
 * further letterboxing) is correct here because {@link computeArtGrid} already baked
 * the real aspect ratio into the cols/rows the caller derives `sampleWidth`/`sampleHeight`
 * from.
 */
export async function sampleImage(
  bytes: Uint8Array,
  sampleWidth: number,
  sampleHeight: number,
): Promise<SampledImage> {
  assertBoundedInput(bytes);
  const { data, info } = await sharp(bytes, SHARP_INPUT_LIMITS)
    .rotate()
    .resize({
      width: Math.max(1, Math.round(sampleWidth)),
      height: Math.max(1, Math.round(sampleHeight)),
      fit: 'fill',
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

export interface ArtPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Clamps to the sample's edge rather than throwing — a renderer computing `row*2+1`
 * for the last output row of an odd-height sample never goes out of bounds. */
export function pixelAt(sample: SampledImage, x: number, y: number): ArtPixel {
  const xx = clamp(Math.floor(x), 0, sample.width - 1);
  const yy = clamp(Math.floor(y), 0, sample.height - 1);
  const index = (yy * sample.width + xx) * 4;
  return {
    r: sample.data[index] ?? 0,
    g: sample.data[index + 1] ?? 0,
    b: sample.data[index + 2] ?? 0,
    a: sample.data[index + 3] ?? 255,
  };
}

/** A pixel counts as opaque above this alpha — anything dimmer renders as the
 * terminal's own default background/foreground rather than a half-transparent blend
 * (spec-adjacent guidance from the task brief: "Transparent pixels → terminal default
 * bg"). 128 is the natural midpoint of the 0-255 alpha channel. */
export const ALPHA_OPAQUE_THRESHOLD = 128;
