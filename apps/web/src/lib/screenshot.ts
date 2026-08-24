import { screenshotWithinGuard } from './diagnosticsReporter.js';

/**
 * Opt-in, user-granted screenshot capture for the web issue reporter (B-112): one
 * frame of `getDisplayMedia`, downscaled to ≤1280px wide on a canvas and attached as
 * a size-guarded PNG data URL. Native APIs only — no html2canvas (no new heavy deps).
 */

export const SCREENSHOT_MAX_WIDTH = 1280;

/** Width ladder tried in order until the PNG fits the bundle's screenshot guard. */
export const SCREENSHOT_WIDTH_LADDER = [1280, 960, 640] as const;

export type CaptureResult =
  { ok: true; dataUrl: string } | { ok: false; reason: 'unsupported' | 'denied' | 'too-large' };

/** Pure helper: the capture width for a source video track (never upscaled). */
export function scaledWidth(sourceWidth: number, maxWidth = SCREENSHOT_MAX_WIDTH): number {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) return maxWidth;
  return Math.min(Math.floor(sourceWidth), maxWidth);
}

/** The minimal view of a decoded frame the drawer needs. */
export interface CapturedFrame {
  readonly videoWidth: number;
  readonly videoHeight: number;
}

export interface CaptureDeps {
  getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
  /** Opens the stream and resolves once a first frame is decodable. Must be released by the caller. */
  openFrame?: (stream: MediaStream) => Promise<CapturedFrame & { release: () => void }>;
  /** Draws the captured frame at `width` and returns its PNG data URL. */
  drawFrame?: (frame: CapturedFrame, width: number) => string;
}

function defaultDrawFrame(frame: CapturedFrame, width: number): string {
  const aspect =
    frame.videoHeight > 0 && frame.videoWidth > 0 ? frame.videoHeight / frame.videoWidth : 0.5625;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(width * aspect));
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('canvas 2d context unavailable');
  context.drawImage(
    frame as CapturedFrame & { drawImage?: unknown } as unknown as CanvasImageSource,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL('image/png');
}

async function defaultOpenFrame(
  stream: MediaStream,
): Promise<CapturedFrame & { release: () => void }> {
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  // Play must settle before drawImage has real pixels; jsdom never gets this far.
  await video.play();
  // One tick for the compositor — a same-tick draw can race the first decoded frame.
  await new Promise((resolve) => setTimeout(resolve, 50));
  return {
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    release: () => {
      video.srcObject = null;
    },
  };
}

/**
 * Asks the user to share a screen/tab/window via the browser's own picker, captures a
 * single frame, downscales it through {@link SCREENSHOT_WIDTH_LADDER} until it fits
 * {@link DIAGNOSTICS_SCREENSHOT_MAX_CHARS}, and always stops every track. Never
 * captures without the explicit permission prompt.
 */
export async function captureScreenshotDataUrl(deps: CaptureDeps = {}): Promise<CaptureResult> {
  const getDisplayMedia =
    deps.getDisplayMedia ??
    (typeof navigator !== 'undefined' && navigator.mediaDevices !== undefined
      ? navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
      : undefined);
  if (getDisplayMedia === undefined) return { ok: false, reason: 'unsupported' };
  const openFrame = deps.openFrame ?? defaultOpenFrame;
  const drawFrame = deps.drawFrame ?? defaultDrawFrame;

  let stream: MediaStream;
  try {
    stream = await getDisplayMedia({ video: true });
  } catch {
    return { ok: false, reason: 'denied' };
  }

  try {
    let frame: Awaited<ReturnType<typeof openFrame>> | undefined;
    try {
      frame = await openFrame(stream);
      for (const width of SCREENSHOT_WIDTH_LADDER) {
        const dataUrl = drawFrame(frame, scaledWidth(frame.videoWidth || width, width));
        if (screenshotWithinGuard(dataUrl)) return { ok: true, dataUrl };
      }
      return { ok: false, reason: 'too-large' };
    } finally {
      frame?.release();
    }
  } catch {
    return { ok: false, reason: 'denied' };
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}
