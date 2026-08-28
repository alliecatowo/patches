/**
 * Client-side aspect-ratio crop for profile media (#324 — avatar 1:1, banner 3:1).
 * Deliberately a *centered* crop only (no interactive pan/zoom UI): the source image is
 * cropped to the largest centered rectangle at `aspect` and re-encoded, then handed to
 * `uploadMedia` for the existing presigned-PUT flow — image bytes never reach the Node
 * server (§30, §153), only the browser's own canvas.
 */

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pure helper: the largest `width / height === aspect` rectangle centered inside a
 * `sourceWidth x sourceHeight` image. Exported for unit testing without a real canvas. */
export function centeredCropRect(
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
): CropRect {
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect > aspect) {
    // Source is wider than the target — crop the sides.
    const width = Math.round(sourceHeight * aspect);
    return { x: Math.round((sourceWidth - width) / 2), y: 0, width, height: sourceHeight };
  }
  // Source is taller than (or equal to) the target — crop top/bottom.
  const height = Math.round(sourceWidth / aspect);
  return { x: 0, y: Math.round((sourceHeight - height) / 2), width: sourceWidth, height };
}

/** Re-encodes `file` as a PNG cropped to `aspect` (width / height), capped at
 * `maxOutputWidth` so a crop of a huge source image doesn't produce an oversized upload.
 * Rejects with the same shape `fileToScreenshotDataUrl` uses so callers share one
 * "couldn't decode this image" error path. */
export async function cropImageToAspect(
  file: File,
  aspect: number,
  maxOutputWidth = 1024,
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const crop = centeredCropRect(bitmap.width, bitmap.height, aspect);
    const outputWidth = Math.min(crop.width, maxOutputWidth);
    const outputHeight = Math.round(outputWidth / aspect);

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('canvas 2d context unavailable');
    context.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      outputWidth,
      outputHeight,
    );

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob === null) throw new Error('failed to encode cropped image');
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}
