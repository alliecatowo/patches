/**
 * Half-block terminal art (chafa/timg's "symbols" fallback technique — see
 * `docs/research/terminal-image-art.md`): two vertically-stacked pixels per cell,
 * drawn as U+2580/U+2584 (upper/lower half block) with the pixel colours as the
 * glyph's foreground/background SGR. No raw stdout writes and no terminal-side state
 * (unlike `KittyGraphicsRenderer`) — every row is plain text Ink can lay out and diff
 * like any other `<Text>` content.
 */
import { clamp, contentHash, DEFAULT_CELL_HEIGHT_PX, DEFAULT_CELL_WIDTH_PX } from '../limits.js';
import type {
  MediaSource,
  PrepareOptions,
  PreparedImage,
  TerminalMediaRenderer,
} from '../renderer.js';
import type { ColorSupport } from './color.js';
import { bgColor, fgColor, RESET_ALL, RESET_BG, RESET_FG } from './color.js';
import {
  ALPHA_OPAQUE_THRESHOLD,
  computeArtGrid,
  MAX_ART_COLS,
  MAX_ART_ROWS,
  pixelAt,
  sampleImage,
  type SampledImage,
} from './shared.js';

const UPPER_HALF_BLOCK = '▀';
const LOWER_HALF_BLOCK = '▄';

/** Prepared art placements cost no terminal-side resource (unlike Kitty's virtual
 * placements), but the pre-rendered row strings for a full-screen image are not free
 * either — cap how many distinct (image, size) renders we keep around. */
const MAX_ART_CACHE_ENTRIES = 8;

interface CachedArt {
  prepared: PreparedImage;
  rows: string[];
}

function renderRow(
  sample: SampledImage,
  cols: number,
  row: number,
  support: 'truecolor' | '256',
): string {
  let line = '';
  for (let col = 0; col < cols; col += 1) {
    const top = pixelAt(sample, col, row * 2);
    const bottom = pixelAt(sample, col, row * 2 + 1);
    const topOpaque = top.a >= ALPHA_OPAQUE_THRESHOLD;
    const bottomOpaque = bottom.a >= ALPHA_OPAQUE_THRESHOLD;

    if (!topOpaque && !bottomOpaque) {
      line += `${RESET_FG}${RESET_BG} `;
    } else if (topOpaque && bottomOpaque) {
      line += `${fgColor(top.r, top.g, top.b, support)}${bgColor(bottom.r, bottom.g, bottom.b, support)}${UPPER_HALF_BLOCK}`;
    } else if (topOpaque) {
      // Bottom half transparent: draw the top pixel's colour as the glyph's ink and
      // let the (reset) background stand in for "terminal default bg".
      line += `${fgColor(top.r, top.g, top.b, support)}${RESET_BG}${UPPER_HALF_BLOCK}`;
    } else {
      // Top half transparent: swap to the lower half block so the *opaque* bottom
      // pixel is the one carried by the foreground colour, not the background.
      line += `${fgColor(bottom.r, bottom.g, bottom.b, support)}${RESET_BG}${LOWER_HALF_BLOCK}`;
    }
  }
  return `${line}${RESET_ALL}`;
}

function cacheKey(hash: string, cols: number, rows: number, support: ColorSupport): string {
  return `${hash}:${String(cols)}x${String(rows)}:${support}`;
}

/**
 * Half-block image art (spec §75-adjacent: this is the *pixel* non-Kitty rendering
 * mode, not the description box). Degrades from 24-bit truecolor to the xterm
 * 256-colour cube depending on the `colorSupport` it was constructed with —
 * `createRenderer` picks that from `detectColorSupport()`.
 */
export class HalfBlockRenderer implements TerminalMediaRenderer {
  readonly kind = 'halfblock' as const;

  readonly #cellWidthPx: number;
  readonly #cellHeightPx: number;
  readonly #colorSupport: 'truecolor' | '256';
  /** cache key -> rendered rows + the handle we gave the caller. */
  readonly #cache = new Map<string, CachedArt>();
  readonly #keyById = new Map<number, string>();
  #nextId = 1;

  constructor(
    caps: Partial<{ cellWidthPx: number; cellHeightPx: number }> = {},
    colorSupport: 'truecolor' | '256' = 'truecolor',
  ) {
    this.#cellWidthPx = caps.cellWidthPx ?? DEFAULT_CELL_WIDTH_PX;
    this.#cellHeightPx = caps.cellHeightPx ?? DEFAULT_CELL_HEIGHT_PX;
    this.#colorSupport = colorSupport;
  }

  async prepare(source: MediaSource, opts: PrepareOptions): Promise<PreparedImage> {
    const maxCols = clamp(Math.floor(opts.maxCols), 1, MAX_ART_COLS);
    const maxRows = clamp(Math.floor(opts.maxRows), 1, MAX_ART_ROWS);
    const hash = contentHash(source.bytes);
    const key = cacheKey(hash, maxCols, maxRows, this.#colorSupport);

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
    const sample = await sampleImage(source.bytes, grid.cols, grid.rows * 2);
    const rows: string[] = [];
    for (let row = 0; row < grid.rows; row += 1) {
      rows.push(renderRow(sample, grid.cols, row, this.#colorSupport));
    }

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
