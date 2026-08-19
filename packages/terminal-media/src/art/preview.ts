/**
 * A one-shot thumbnail preview, independent of any `TerminalMediaRenderer` instance —
 * for a compose screen or file picker that wants to show what a *local* file (not yet
 * uploaded, no `MediaAttachment`/media id) will look like as terminal art, without
 * owning a renderer's cache/lifecycle. Not wired into any screen by this change; the
 * ComposeScreen owner calls this directly when ready (see the task brief).
 */
import { AsciiRenderer } from './ascii-renderer.js';
import { detectColorSupport } from './color.js';
import { HalfBlockRenderer } from './halfblock-renderer.js';
import type { ImageRenderMode, MediaSource } from '../renderer.js';
import { FallbackMediaRenderer } from '../renderer.js';

export interface RenderArtPreviewOptions {
  cols: number;
  rows: number;
  /**
   * Same vocabulary as `createRenderer`'s mode, minus `'kitty'`: a returned string
   * array can never carry a real Kitty transmission (that has to go straight to
   * `process.stdout`, out of band — see `KittyGraphicsRenderer`'s own doc comment),
   * so `'kitty'` renders as the best colour art available instead, same as `'auto'`.
   * `'off'` renders as `'box'` — the caller asked not to draw anything real, and the
   * description box is exactly that "nothing real" placeholder.
   */
  mode?: ImageRenderMode;
  env?: NodeJS.ProcessEnv;
  cellWidthPx?: number;
  cellHeightPx?: number;
}

function bestColorRenderer(
  env: NodeJS.ProcessEnv,
  caps: Partial<{ cellWidthPx: number; cellHeightPx: number }>,
): AsciiRenderer | HalfBlockRenderer {
  const support = detectColorSupport(env);
  return support === 'none' ? new AsciiRenderer(caps) : new HalfBlockRenderer(caps, support);
}

/** No terminal-side resource to release for any of these renderer kinds (only Kitty's
 * does, and `renderArtPreview` never uses Kitty), so a fresh one-off renderer per call
 * is cheap and needs no cleanup — the caller gets back plain strings. */
export async function renderArtPreview(
  bytes: Uint8Array,
  options: RenderArtPreviewOptions,
): Promise<string[]> {
  const { cols, rows, mode = 'auto', env = process.env, cellWidthPx, cellHeightPx } = options;
  const caps = {
    ...(cellWidthPx !== undefined && { cellWidthPx }),
    ...(cellHeightPx !== undefined && { cellHeightPx }),
  };
  const source: MediaSource = { bytes, mime: 'application/octet-stream' };

  const renderer =
    mode === 'box' || mode === 'off'
      ? new FallbackMediaRenderer()
      : mode === 'ascii'
        ? new AsciiRenderer(caps)
        : bestColorRenderer(env, caps);

  const image = await renderer.prepare(source, { maxCols: cols, maxRows: rows });
  return renderer.placeholderRows(image);
}
