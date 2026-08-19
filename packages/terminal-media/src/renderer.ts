/**
 * The `TerminalMediaRenderer` abstraction (spec §73) and its two v0 implementations.
 *
 * `KittyGraphicsRenderer` transmits images out-of-band via raw stdout and returns text
 * rows of Unicode placeholders for Ink to lay out. `FallbackMediaRenderer` returns a
 * bordered description box (spec §75). Both satisfy the same interface, so the TUI never
 * branches on terminal capability outside `createRenderer`.
 */
import sharp from 'sharp';

import { AsciiRenderer } from './art/ascii-renderer.js';
import { detectColorSupport } from './art/color.js';
import { HalfBlockRenderer } from './art/halfblock-renderer.js';
import type { GraphicsCapabilities } from './detect.js';
import {
  assertBoundedInput,
  clamp,
  contentHash,
  DEFAULT_CELL_HEIGHT_PX,
  DEFAULT_CELL_WIDTH_PX,
  SHARP_INPUT_LIMITS,
} from './limits.js';
import { MAX_PLACEHOLDER_INDEX } from './protocol/diacritics.js';
import {
  buildPlaceholderGrid,
  chunkTransmit,
  deleteImage,
  nextImageId,
  wrapTmuxPassthrough,
} from './protocol/kitty.js';

export {
  DEFAULT_CELL_HEIGHT_PX,
  DEFAULT_CELL_WIDTH_PX,
  MAX_INPUT_BYTES,
  MediaTooLargeError,
} from './limits.js';

/** A transmitted image, sized to a cell grid. */
export interface PreparedImage {
  /** kitty image id (`i=`). Unique per terminal for the lifetime of the placement. */
  readonly id: number;
  /** Width of the on-screen placement in terminal cells. */
  readonly cols: number;
  /** Height of the on-screen placement in terminal cells. */
  readonly rows: number;
  /** Width of the (possibly downscaled) image in pixels. */
  readonly widthPx: number;
  /** Height of the (possibly downscaled) image in pixels. */
  readonly heightPx: number;
}

/** Raw bytes plus the MIME type they were served with. */
export interface MediaSource {
  bytes: Uint8Array;
  mime: string;
}

/** The cell budget the image must fit inside. */
export interface PrepareOptions {
  maxCols: number;
  maxRows: number;
}

export interface TerminalMediaRenderer {
  readonly kind: 'kitty' | 'halfblock' | 'ascii' | 'box';
  /**
   * Decode, downscale and (for kitty) transmit an image. Idempotent for the same bytes
   * and the same cell budget: the second call returns the cached handle without
   * re-transmitting.
   */
  prepare(source: MediaSource, opts: PrepareOptions): Promise<PreparedImage>;
  /** The text rows to render, one string per terminal row. Drop each into a bare `<Text>`. */
  placeholderRows(img: PreparedImage): string[];
  /** Free one image's terminal-side data. */
  release(img: PreparedImage): void;
  /** Free every image this renderer transmitted. Safe to call from `process.on('exit')`. */
  releaseAll(): void;
}

/** Anything we can write escape sequences to. `process.stdout` satisfies it. */
export interface MediaStdout {
  write: (data: string) => unknown;
}

/** Largest placement the diacritic table can address, in either axis. */
const MAX_GRID = MAX_PLACEHOLDER_INDEX + 1;
/** Terminal-side virtual placements are a scarce, process-external resource. */
export const MAX_LIVE_KITTY_PLACEMENTS = 4;

/** Renders images inline using the kitty graphics protocol with Unicode placeholders. */
export class KittyGraphicsRenderer implements TerminalMediaRenderer {
  readonly kind = 'kitty' as const;

  readonly #stdout: MediaStdout;
  readonly #cellWidthPx: number;
  readonly #cellHeightPx: number;
  /** B-007: wrap every transmission in tmux's DCS passthrough envelope. Set only when
   * `detectTerminalGraphics` confirmed kitty support *through* tmux passthrough. */
  readonly #tmux: boolean;
  /** cache key (`hash:maxColsxmaxRows`) -> transmitted image. */
  readonly #cache = new Map<string, PreparedImage>();
  /** content hash -> the cache key currently holding it, so a resize can evict the old one. */
  readonly #keyByHash = new Map<string, string>();
  readonly #live = new Set<number>();

  /**
   * @param stdout MUST be the real `process.stdout`, not Ink's `useStdout().write`,
   *   which erases and repaints Ink's frame around every write (research doc §4).
   */
  constructor(
    stdout: MediaStdout,
    caps: Pick<GraphicsCapabilities, 'cellWidthPx' | 'cellHeightPx' | 'tmux'>,
  ) {
    this.#stdout = stdout;
    this.#cellWidthPx = caps.cellWidthPx ?? DEFAULT_CELL_WIDTH_PX;
    this.#cellHeightPx = caps.cellHeightPx ?? DEFAULT_CELL_HEIGHT_PX;
    this.#tmux = caps.tmux ?? false;
  }

  /** Every APC write goes through here so tmux passthrough wrapping is applied exactly
   * once, in exactly one place (spec: "the fix is one call"). */
  #write(sequence: string): void {
    this.#stdout.write(this.#tmux ? wrapTmuxPassthrough(sequence) : sequence);
  }

  async prepare(source: MediaSource, opts: PrepareOptions): Promise<PreparedImage> {
    assertBoundedInput(source.bytes);
    const maxCols = clamp(Math.floor(opts.maxCols), 1, MAX_GRID);
    const maxRows = clamp(Math.floor(opts.maxRows), 1, MAX_GRID);
    const hash = contentHash(source.bytes);
    const key = `${hash}:${maxCols}x${maxRows}`;

    const hit = this.#cache.get(key);
    if (hit) {
      this.#cache.delete(key);
      this.#cache.set(key, hit);
      return hit;
    }

    // Same bytes at a different cell budget (a resize): the old placement is dead weight.
    const staleKey = this.#keyByHash.get(hash);
    if (staleKey !== undefined) {
      const stale = this.#cache.get(staleKey);
      if (stale) this.release(stale);
    }

    // `rotate()` with no argument applies the EXIF orientation and drops the tag, so the
    // pixels we transmit are the pixels the user expects to see.
    const { data, info } = await sharp(source.bytes, SHARP_INPUT_LIMITS)
      .rotate()
      .resize({
        width: maxCols * this.#cellWidthPx,
        height: maxRows * this.#cellHeightPx,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer({ resolveWithObject: true });

    const cols = clamp(Math.ceil(info.width / this.#cellWidthPx), 1, maxCols);
    const rows = clamp(Math.ceil(info.height / this.#cellHeightPx), 1, maxRows);
    const id = nextImageId(this.#live);

    // One write: the protocol forbids interleaving other graphics codes between chunks.
    this.#write(chunkTransmit(data, { id, cols, rows }).join(''));

    const prepared: PreparedImage = {
      id,
      cols,
      rows,
      widthPx: info.width,
      heightPx: info.height,
    };
    this.#live.add(id);
    this.#cache.set(key, prepared);
    this.#keyByHash.set(hash, key);
    this.#evictOverflow();
    return prepared;
  }

  /** Oldest prepared placement first. Map insertion order is our LRU order; cache
   * hits are promoted so a frequently revisited selected image stays resident. */
  #evictOverflow(): void {
    while (this.#cache.size > MAX_LIVE_KITTY_PLACEMENTS) {
      const oldest = this.#cache.values().next();
      if (oldest.done) return;
      this.release(oldest.value);
    }
  }

  placeholderRows(img: PreparedImage): string[] {
    return buildPlaceholderGrid(img.id, img.cols, img.rows);
  }

  release(img: PreparedImage): void {
    if (!this.#live.delete(img.id)) return;
    this.#write(deleteImage(img.id));
    for (const [key, cached] of this.#cache) {
      if (cached.id !== img.id) continue;
      this.#cache.delete(key);
      for (const [hash, hashKey] of this.#keyByHash) {
        if (hashKey === key) this.#keyByHash.delete(hash);
      }
    }
  }

  releaseAll(): void {
    // Per-id `d=I`, not `d=A`: kitty only deletes *virtual* placements via i/I/r/R/n/N.
    const ids = [...this.#live];
    this.#live.clear();
    if (ids.length > 0) this.#write(ids.map((id) => deleteImage(id)).join(''));
    this.#cache.clear();
    this.#keyByHash.clear();
  }
}

/** Description of an image we could not draw, used to build the fallback box. */
interface FallbackDetails {
  widthPx: number;
  heightPx: number;
  format: string;
  cols: number;
}

/** Spec §75: a bordered box describing the image, for terminals with no graphics protocol. */
export class FallbackMediaRenderer implements TerminalMediaRenderer {
  readonly kind = 'box' as const;

  /** The box is always exactly this tall: top border, hint line, bottom border. */
  static readonly BOX_ROWS = 3;

  readonly #details = new Map<number, FallbackDetails>();
  #nextId = 1;

  async prepare(source: MediaSource, opts: PrepareOptions): Promise<PreparedImage> {
    assertBoundedInput(source.bytes);
    let widthPx = 0;
    let heightPx = 0;
    let format = mimeSubtype(source.mime);
    try {
      const metadata = await sharp(source.bytes, SHARP_INPUT_LIMITS).metadata();
      widthPx = metadata.width ?? 0;
      heightPx = metadata.height ?? 0;
      format = metadata.format ?? format;
    } catch {
      // Undecodable bytes still deserve a box; we just cannot name their dimensions.
    }

    const cols = Math.max(Math.floor(opts.maxCols), 4);
    const rows = Math.max(Math.min(Math.floor(opts.maxRows), FallbackMediaRenderer.BOX_ROWS), 1);
    const id = this.#nextId++;
    this.#details.set(id, { widthPx, heightPx, format, cols });
    return { id, cols, rows, widthPx, heightPx };
  }

  placeholderRows(img: PreparedImage): string[] {
    const details = this.#details.get(img.id);
    const format = details?.format ?? 'image';
    const size =
      img.widthPx > 0 && img.heightPx > 0 ? `${img.widthPx}×${img.heightPx}` : 'unknown size';
    return buildFallbackBox(img.cols, `image · ${size} · ${format}`).slice(0, img.rows);
  }

  release(img: PreparedImage): void {
    this.#details.delete(img.id);
  }

  releaseAll(): void {
    this.#details.clear();
  }
}

function mimeSubtype(mime: string): string {
  const slash = mime.indexOf('/');
  return slash === -1 ? mime : mime.slice(slash + 1);
}

/**
 * The §75 placeholder box:
 *
 * ```text
 * ┌ image · 1600×1067 · jpeg ──┐
 * │ press o to open externally │
 * └────────────────────────────┘
 * ```
 *
 * Exported for tests; every returned row is exactly `cols` display columns wide, so it
 * drops into the same fixed-width `<Box>` an image would have used.
 */
export function buildFallbackBox(
  cols: number,
  label: string,
  hint = 'press o to open externally',
): string[] {
  const width = Math.max(cols, 4);
  const inner = width - 2;
  const paddedLabel = ` ${label} `;
  const title = paddedLabel.length > inner ? paddedLabel.slice(0, inner) : paddedLabel;
  const trimmedHint = hint.length > inner - 2 ? hint.slice(0, Math.max(inner - 2, 0)) : hint;
  return [
    `┌${title}${'─'.repeat(inner - title.length)}┐`,
    `│ ${trimmedHint.padEnd(inner - 2, ' ')} │`,
    `└${'─'.repeat(inner)}┘`,
  ];
}

/**
 * How an image should be rendered, independent of what the terminal was probed to
 * support. `'auto'` is the only mode that consults `caps`/colour detection at all —
 * every other value forces a specific renderer so a user (or `PATCHES_IMAGES`/the
 * `images` preference row) can always get a predictable result:
 *
 * - `'kitty'` — the real Kitty graphics protocol. Forced regardless of `caps.kitty`;
 *   a caller asking for this explicitly is asserting they know their terminal
 *   supports it (e.g. a probe that failed for an unrelated reason).
 * - `'pixel'` — half-block art (`HalfBlockRenderer`), truecolor or 256-colour
 *   depending on `detectColorSupport()`, degrading further to `'ascii'` when colour
 *   isn't available at all (there is no colourless "pixel" mode).
 * - `'ascii'` — the colourless luminance-ramp renderer, unconditionally.
 * - `'box'` / `'off'` — the spec §75 description box. Identical renderer: `'off'`
 *   exists as a distinct name because the *policy* of "never fetch or draw a
 *   placement" is enforced one layer up (the TUI's `ImagePolicy`), not by this
 *   function — by the time a renderer is asked to `prepare()` anything, "should we
 *   draw at all" has already been decided.
 */
export type ImageRenderMode = 'auto' | 'kitty' | 'pixel' | 'ascii' | 'box' | 'off';

export interface CreateRendererOptions {
  mode?: ImageRenderMode;
  /** Consulted only for `'auto'`/`'pixel'` colour degradation. Defaults to
   * `process.env`; overridden in tests. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Pick the renderer that matches the detected terminal (`mode: 'auto'`, the default)
 * or the caller's explicit choice.
 *
 * Spec §153: "TUI must always have a non-Kitty fallback" — every mode other than
 * `'kitty'` satisfies that trivially, and `'auto'` only ever picks `'kitty'` when the
 * probe confirmed it.
 */
export function createRenderer(
  caps: GraphicsCapabilities,
  stdout: MediaStdout = process.stdout,
  options: CreateRendererOptions = {},
): TerminalMediaRenderer {
  const { mode = 'auto', env = process.env } = options;

  if (mode === 'box' || mode === 'off') return new FallbackMediaRenderer();
  if (mode === 'kitty') return new KittyGraphicsRenderer(stdout, caps);
  if (mode === 'ascii') return new AsciiRenderer(caps);
  if (mode === 'pixel') {
    const support = detectColorSupport(env);
    return support === 'none' ? new AsciiRenderer(caps) : new HalfBlockRenderer(caps, support);
  }

  // 'auto'
  if (caps.kitty) return new KittyGraphicsRenderer(stdout, caps);
  const support = detectColorSupport(env);
  return support === 'none' ? new AsciiRenderer(caps) : new HalfBlockRenderer(caps, support);
}
