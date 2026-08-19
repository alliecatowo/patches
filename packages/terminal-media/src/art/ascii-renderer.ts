/**
 * Colourless ASCII terminal art: a dithered luminance ramp, one character per cell.
 * The last-resort non-Kitty rendering mode — used when `detectColorSupport()` says
 * 'none' (`NO_COLOR`, `TERM=dumb`, no `TERM` at all) so that not even 256-colour SGR
 * is emitted. See `docs/research/terminal-image-art.md` for the ramp/dithering
 * convention and prior art. A future braille (U+2800-U+28FF) variant is documented
 * there but not implemented in v0 — the ramp technique alone already satisfies "TUI
 * must always have a non-Kitty fallback" (spec §75/§153) with full test coverage.
 */
import { clamp, contentHash, DEFAULT_CELL_HEIGHT_PX, DEFAULT_CELL_WIDTH_PX } from '../limits.js';
import type {
  MediaSource,
  PrepareOptions,
  PreparedImage,
  TerminalMediaRenderer,
} from '../renderer.js';
import {
  ALPHA_OPAQUE_THRESHOLD,
  computeArtGrid,
  MAX_ART_COLS,
  MAX_ART_ROWS,
  pixelAt,
  sampleImage,
  type SampledImage,
} from './shared.js';

/** Darkest to brightest, as given in the task brief. Index 0 (space) renders a dark
 * pixel as blank — it blends into a terminal's typically dark background; the last
 * character (`@`) is the densest glyph available, for the brightest pixels. */
export const LUMINANCE_RAMP = ' .:-=+*#%@';

/** 4x4 Bayer ordered-dithering matrix (values 0-15) — spreads quantization error
 * across neighbouring cells instead of banding, without needing error-diffusion state
 * that would make row N depend on row N-1 (each row renders independently). */
const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 5, 13],
];

/** ITU-R BT.601 luma coefficients — the conventional greyscale weighting for 8-bit
 * RGB (see the research note). */
function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Offset (roughly ±half a ramp step) added to a pixel's luminance before
 * quantizing, so adjacent cells at a near-boundary luminance don't all round the same
 * way and band. */
function ditherOffset(x: number, y: number, levels: number): number {
  const cell = BAYER_4X4[y % 4]?.[x % 4] ?? 0;
  const normalized = (cell + 0.5) / 16 - 0.5; // (-0.5, 0.5)
  return normalized * (256 / levels);
}

function rampChar(luma: number, x: number, y: number): string {
  const levels = LUMINANCE_RAMP.length;
  const dithered = clamp(luma + ditherOffset(x, y, levels), 0, 255);
  const index = clamp(Math.floor((dithered / 256) * levels), 0, levels - 1);
  return LUMINANCE_RAMP[index] ?? ' ';
}

function renderRow(sample: SampledImage, cols: number, row: number): string {
  let line = '';
  for (let col = 0; col < cols; col += 1) {
    const pixel = pixelAt(sample, col, row);
    line +=
      pixel.a < ALPHA_OPAQUE_THRESHOLD
        ? ' '
        : rampChar(luminance(pixel.r, pixel.g, pixel.b), col, row);
  }
  return line;
}

/** Prepared placements cost no terminal-side resource, but we still bound how many
 * distinct (image, size) renders stay cached (mirrors `HalfBlockRenderer`). */
const MAX_ART_CACHE_ENTRIES = 8;

interface CachedArt {
  prepared: PreparedImage;
  rows: string[];
}

export class AsciiRenderer implements TerminalMediaRenderer {
  readonly kind = 'ascii' as const;

  readonly #cellWidthPx: number;
  readonly #cellHeightPx: number;
  readonly #cache = new Map<string, CachedArt>();
  readonly #keyById = new Map<number, string>();
  #nextId = 1;

  constructor(caps: Partial<{ cellWidthPx: number; cellHeightPx: number }> = {}) {
    this.#cellWidthPx = caps.cellWidthPx ?? DEFAULT_CELL_WIDTH_PX;
    this.#cellHeightPx = caps.cellHeightPx ?? DEFAULT_CELL_HEIGHT_PX;
  }

  async prepare(source: MediaSource, opts: PrepareOptions): Promise<PreparedImage> {
    const maxCols = clamp(Math.floor(opts.maxCols), 1, MAX_ART_COLS);
    const maxRows = clamp(Math.floor(opts.maxRows), 1, MAX_ART_ROWS);
    const hash = contentHash(source.bytes);
    const key = `${hash}:${String(maxCols)}x${String(maxRows)}`;

    const hit = this.#cache.get(key);
    if (hit) {
      this.#cache.delete(key);
      this.#cache.set(key, hit);
      return hit.prepared;
    }

    const grid = await computeArtGrid(source.bytes, maxCols, maxRows, {
      cellWidthPx: this.#cellWidthPx,
      cellHeightPx: this.#cellHeightPx,
    });
    const sample = await sampleImage(source.bytes, grid.cols, grid.rows);
    const rows: string[] = [];
    for (let row = 0; row < grid.rows; row += 1) rows.push(renderRow(sample, grid.cols, row));

    const id = this.#nextId;
    this.#nextId += 1;
    const prepared: PreparedImage = {
      id,
      cols: grid.cols,
      rows: grid.rows,
      widthPx: grid.widthPx,
      heightPx: grid.heightPx,
    };
    this.#cache.set(key, { prepared, rows });
    this.#keyById.set(id, key);
    this.#evictOverflow();
    return prepared;
  }

  placeholderRows(img: PreparedImage): string[] {
    const key = this.#keyById.get(img.id);
    return key === undefined ? [] : (this.#cache.get(key)?.rows ?? []);
  }

  release(img: PreparedImage): void {
    const key = this.#keyById.get(img.id);
    if (key === undefined) return;
    this.#keyById.delete(img.id);
    this.#cache.delete(key);
  }

  releaseAll(): void {
    this.#cache.clear();
    this.#keyById.clear();
  }

  #evictOverflow(): void {
    while (this.#cache.size > MAX_ART_CACHE_ENTRIES) {
      const oldest = this.#cache.keys().next();
      if (oldest.done) return;
      const key = oldest.value;
      this.#cache.delete(key);
      for (const [id, candidateKey] of this.#keyById) {
        if (candidateKey === key) this.#keyById.delete(id);
      }
    }
  }
}
