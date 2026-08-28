import { afterEach, describe, expect, it, vi } from 'vitest';

import { centeredCropRect, cropImageToAspect } from './imageCrop.js';

describe('centeredCropRect', () => {
  it('crops the sides of a wider-than-target source', () => {
    // 400x200 source, 1:1 target → 200x200 centered.
    expect(centeredCropRect(400, 200, 1)).toEqual({ x: 100, y: 0, width: 200, height: 200 });
  });

  it('crops top/bottom of a taller-than-target source', () => {
    // 300x300 source, 3:1 target → 300x100 centered vertically.
    expect(centeredCropRect(300, 300, 3)).toEqual({ x: 0, y: 100, width: 300, height: 100 });
  });

  it('is a no-op when the source already matches the target aspect', () => {
    expect(centeredCropRect(300, 100, 3)).toEqual({ x: 0, y: 0, width: 300, height: 100 });
  });
});

describe('cropImageToAspect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws the centered crop rect onto a canvas sized to the target aspect', async () => {
    const close = vi.fn();
    const bitmap = { width: 400, height: 200, close } as unknown as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

    const drawImage = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const element = originalCreateElement(tag);
      if (tag === 'canvas') {
        const canvas = element as unknown as {
          getContext: (id: string) => CanvasRenderingContext2D | null;
          toBlob: (cb: (blob: Blob | null) => void, type: string) => void;
        };
        canvas.getContext = (id: string) =>
          id === '2d' ? ({ drawImage } as unknown as CanvasRenderingContext2D) : null;
        canvas.toBlob = (callback) => callback(new Blob(['png'], { type: 'image/png' }));
      }
      return element;
    });

    const file = new File(['source'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await cropImageToAspect(file, 1, 1024);

    expect(result.type).toBe('image/png');
    expect(result.name).toBe('photo.png');
    // Source crop rect (100, 0, 200, 200) drawn to the full output canvas.
    expect(drawImage).toHaveBeenCalledWith(bitmap, 100, 0, 200, 200, 0, 0, 200, 200);
    expect(close).toHaveBeenCalled();
  });

  it('rejects when the canvas has no 2d context', async () => {
    const bitmap = { width: 100, height: 100, close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const element = originalCreateElement(tag);
      if (tag === 'canvas') {
        (element as unknown as { getContext: () => null }).getContext = () => null;
      }
      return element;
    });

    const file = new File(['source'], 'photo.jpg', { type: 'image/jpeg' });
    await expect(cropImageToAspect(file, 1)).rejects.toThrow('canvas 2d context unavailable');
  });
});
