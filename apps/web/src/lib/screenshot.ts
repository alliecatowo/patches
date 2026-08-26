import { screenshotWithinGuard } from './diagnosticsReporter.js';

/**
 * Screenshot attachment for the web issue reporter: the user picks an image from the
 * device's own picker (photo library on iOS PWA, files on desktop), and it is
 * downscaled to ≤1280px wide on a canvas and attached as a size-guarded PNG data
 * URL. Live `getDisplayMedia` capture was removed deliberately (2026-08-26): it does
 * not exist on iOS Safari, and on desktop it could only ever capture the reporter
 * itself — the reporter covers the screen you would want to photograph.
 */

export const SCREENSHOT_MAX_WIDTH = 1280;

/** Width ladder tried in order until the PNG fits the bundle's screenshot guard. */
export const SCREENSHOT_WIDTH_LADDER = [1280, 960, 640] as const;

export type CaptureResult =
  { ok: true; dataUrl: string } | { ok: false; reason: 'unsupported' | 'too-large' | 'unreadable' };

/** Pure helper: the draw width for a source image (never upscaled). */
export function scaledWidth(sourceWidth: number, maxWidth = SCREENSHOT_MAX_WIDTH): number {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) return maxWidth;
  return Math.min(Math.floor(sourceWidth), maxWidth);
}

/**
 * Attach a user-chosen image file as the report screenshot: decoded, downscaled
 * through {@link SCREENSHOT_WIDTH_LADDER}, and size-guarded against
 * {@link DIAGNOSTICS_SCREENSHOT_MAX_CHARS} exactly like the old live capture.
 */
export async function fileToScreenshotDataUrl(file: File): Promise<CaptureResult> {
  if (!file.type.startsWith('image/')) return { ok: false, reason: 'unsupported' };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  try {
    const drawAt = (width: number): string => {
      const scale = bitmap.width > 0 ? width / bitmap.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('canvas 2d context unavailable');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    };
    for (const width of SCREENSHOT_WIDTH_LADDER) {
      const dataUrl = drawAt(scaledWidth(bitmap.width, width));
      if (screenshotWithinGuard(dataUrl)) return { ok: true, dataUrl };
    }
    return { ok: false, reason: 'too-large' };
  } finally {
    bitmap.close();
  }
}
