/**
 * Test images for the spike, generated at runtime.
 *
 * No binary fixtures: the repo stays text-only, and the aspect ratios are explicit here
 * so it is obvious which one is exercising which layout path.
 */
import sharp from 'sharp';

export interface TestImage {
  readonly label: string;
  readonly mime: string;
  readonly bytes: Uint8Array;
  readonly widthPx: number;
  readonly heightPx: number;
}

interface Spec {
  label: string;
  width: number;
  height: number;
  from: string;
  to: string;
}

/** Six deliberately different shapes: wide, square, tall, panoramic, tiny, huge. */
const SPECS: readonly Spec[] = [
  { label: 'landscape 16:9', width: 1600, height: 900, from: '#ff6b6b', to: '#4ecdc4' },
  { label: 'square 1:1', width: 800, height: 800, from: '#f7b731', to: '#5f27cd' },
  { label: 'portrait 2:3', width: 800, height: 1200, from: '#00d2d3', to: '#341f97' },
  { label: 'panorama 4:1', width: 2000, height: 500, from: '#ee5253', to: '#feca57' },
  { label: 'thumbnail 64px', width: 64, height: 64, from: '#10ac84', to: '#222f3e' },
  { label: 'oversized 3:2', width: 3000, height: 2000, from: '#5f27cd', to: '#ff9ff3' },
];

function svg(spec: Spec, index: number): string {
  const fontSize = Math.round(Math.min(spec.width, spec.height) / 6);
  const stroke = Math.max(2, Math.round(Math.min(spec.width, spec.height) / 40));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}">`,
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    `<stop offset="0%" stop-color="${spec.from}"/><stop offset="100%" stop-color="${spec.to}"/>`,
    '</linearGradient></defs>',
    `<rect width="${spec.width}" height="${spec.height}" fill="url(#g)"/>`,
    // A border makes clipping and letterboxing obvious at a glance.
    `<rect x="${stroke / 2}" y="${stroke / 2}" width="${spec.width - stroke}" height="${
      spec.height - stroke
    }" fill="none" stroke="#ffffff" stroke-width="${stroke}"/>`,
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"`,
    ` font-family="monospace" font-size="${fontSize}" font-weight="bold" fill="#ffffff">${index + 1}</text>`,
    '</svg>',
  ].join('');
}

/** Render the six test images to PNG. */
export async function makeTestImages(): Promise<TestImage[]> {
  return await Promise.all(
    SPECS.map(async (spec, index) => {
      const buffer = await sharp(Buffer.from(svg(spec, index)))
        .png()
        .toBuffer();
      return {
        label: spec.label,
        mime: 'image/png',
        bytes: new Uint8Array(buffer),
        widthPx: spec.width,
        heightPx: spec.height,
      };
    }),
  );
}
