import { describe, expect, it } from 'vitest';

import { captureScreenshotDataUrl, scaledWidth, SCREENSHOT_WIDTH_LADDER } from './screenshot.js';

describe('scaledWidth', () => {
  it('downscales to the cap and never upscales', () => {
    expect(scaledWidth(3840)).toBe(1280);
    expect(scaledWidth(1280)).toBe(1280);
    expect(scaledWidth(800)).toBe(800);
  });

  it('falls back to the cap for nonsensical video dimensions', () => {
    expect(scaledWidth(0)).toBe(1280);
    expect(scaledWidth(Number.NaN)).toBe(1280);
  });
});

describe('captureScreenshotDataUrl', () => {
  it('reports unsupported when getDisplayMedia is unavailable (jsdom)', async () => {
    const result = await captureScreenshotDataUrl();
    expect(result).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('walks the width ladder until the PNG fits the guard', async () => {
    const widths: number[] = [];
    const stream = { getTracks: () => [{ stop: (): void => undefined }] };
    const result = await captureScreenshotDataUrl({
      getDisplayMedia: () => Promise.resolve(stream as unknown as MediaStream),
      openFrame: (opened) =>
        Promise.resolve({
          videoWidth: 2560,
          videoHeight: 1440,
          release: () => undefined,
          ...(opened === undefined ? {} : {}),
        }),
      drawFrame: (_frame, width) => {
        widths.push(width);
        return width > 640
          ? `data:image/png;base64,${'A'.repeat(300_000)}`
          : 'data:image/png;base64,AAAA';
      },
    });
    expect(result).toEqual({ ok: true, dataUrl: 'data:image/png;base64,AAAA' });
    // 2560-wide source: every rung of the ladder is tried at its own width.
    expect(widths).toEqual([...SCREENSHOT_WIDTH_LADDER]);
  });

  it('never upscales a narrow source', async () => {
    const widths: number[] = [];
    const stream = { getTracks: () => [{ stop: (): void => undefined }] };
    await captureScreenshotDataUrl({
      getDisplayMedia: () => Promise.resolve(stream as unknown as MediaStream),
      openFrame: () =>
        Promise.resolve({ videoWidth: 500, videoHeight: 300, release: () => undefined }),
      drawFrame: (_frame, width) => {
        widths.push(width);
        return 'data:image/png;base64,AAAA';
      },
    });
    expect(widths).toEqual([500]);
  });

  it('stops every track even when drawing fails', async () => {
    let stopped = 0;
    const stream = { getTracks: () => [{ stop: (): number => (stopped += 1) }] };
    const result = await captureScreenshotDataUrl({
      getDisplayMedia: () => Promise.resolve(stream as unknown as MediaStream),
      drawFrame: () => {
        throw new Error('decode race');
      },
    });
    expect(result).toEqual({ ok: false, reason: 'denied' });
    expect(stopped).toBe(1);
  });

  it('reports denied when the user cancels the picker', async () => {
    const result = await captureScreenshotDataUrl({
      getDisplayMedia: () => Promise.reject(new DOMException('dismissed', 'NotAllowedError')),
    });
    expect(result).toEqual({ ok: false, reason: 'denied' });
  });
});
