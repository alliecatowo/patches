import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fileToScreenshotDataUrl, scaledWidth, SCREENSHOT_WIDTH_LADDER } from './screenshot.js';

describe('scaledWidth', () => {
  it('downscales to the cap and never upscales', () => {
    expect(scaledWidth(3840)).toBe(1280);
    expect(scaledWidth(1280)).toBe(1280);
    expect(scaledWidth(800)).toBe(800);
  });

  it('falls back to the cap for nonsensical dimensions', () => {
    expect(scaledWidth(0)).toBe(1280);
    expect(scaledWidth(Number.NaN)).toBe(1280);
  });
});

describe('fileToScreenshotDataUrl', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects non-image files as unsupported', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await expect(fileToScreenshotDataUrl(file)).resolves.toEqual({
      ok: false,
      reason: 'unsupported',
    });
  });

  it('reports unreadable when the image cannot be decoded', async () => {
    const file = new File(['not really a png'], 'broken.png', { type: 'image/png' });
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    await expect(fileToScreenshotDataUrl(file)).resolves.toEqual({
      ok: false,
      reason: 'unreadable',
    });
  });

  it('downscales through the ladder until the PNG fits the guard', async () => {
    const file = new File(['png'], 'shot.png', { type: 'image/png' });
    const attemptWidths: number[] = [];
    const close = vi.fn();
    const bitmap = { width: 4000, height: 3000, close } as unknown as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    // jsdom canvas has no 2d context — fake one whose data URL only fits the guard
    // once the width ladder descends past a threshold.
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const element = originalCreateElement(tag);
      if (tag === 'canvas') {
        const canvas = element as unknown as {
          width: number;
          height: number;
          getContext: (contextId: string) => CanvasRenderingContext2D | null;
          toDataURL: (type: string) => string;
        };
        canvas.getContext = (contextId: string) =>
          contextId === '2d'
            ? ({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
            : null;
        canvas.toDataURL = () => {
          const width = attemptWidths.at(-1) ?? SCREENSHOT_WIDTH_LADDER[0];
          // Guard is 200_000 chars (DIAGNOSTICS_SCREENSHOT_MAX_CHARS): scale the fake
          // PNG so 1280 and 960 exceed it and only 640 fits.
          return `data:image/png;base64,${'A'.repeat(width * 250)}`;
        };
        let storedWidth = 1;
        Object.defineProperty(element, 'width', {
          get: () => storedWidth,
          set: (value: number) => {
            storedWidth = value;
            attemptWidths.push(value);
          },
          configurable: true,
        });
      }
      return element;
    });

    const result = await fileToScreenshotDataUrl(file);
    if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
    expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(attemptWidths.at(-1)).toBe(SCREENSHOT_WIDTH_LADDER[2]);
    expect(close).toHaveBeenCalled();
    createElement.mockRestore();
  });
});
