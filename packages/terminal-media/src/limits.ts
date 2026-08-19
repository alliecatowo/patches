/**
 * Shared, dependency-free primitives used by every renderer implementation
 * (`renderer.ts`'s Kitty/box renderers, `art/*`'s half-block/ascii renderers).
 *
 * Deliberately a leaf module: it imports nothing from `renderer.ts` or `art/*`, so those
 * modules can import from here without creating an import cycle (`renderer.ts` needs the
 * `art/*` renderer *classes* for `createRenderer`; `art/*` needs these *primitives*).
 */
import { createHash } from 'node:crypto';

/**
 * Reject anything above this before it ever reaches `sharp()` (spec §153: bound
 * untrusted input). This is defense in depth ahead of Phase 5's real upload limits —
 * without it, `prepare()` would happily buffer and decode a client-supplied file of
 * any size.
 */
export const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Pixel-count ceiling passed to every `sharp()` call. Guards against decompression
 * bombs — a small file (well under {@link MAX_INPUT_BYTES}) that decodes to an
 * enormous pixel buffer, e.g. a crafted PNG. 20,000,000 px comfortably covers any
 * real photo (~5000×4000) while still bounding worst-case memory use.
 */
export const SHARP_INPUT_LIMITS = { limitInputPixels: 20_000_000 } as const;

/** Thrown by every renderer's `prepare()` when the source bytes exceed
 * {@link MAX_INPUT_BYTES}. */
export class MediaTooLargeError extends Error {
  constructor(byteLength: number) {
    super(
      `Image is ${String(byteLength)} bytes, which exceeds the ${String(MAX_INPUT_BYTES)}-byte limit.`,
    );
    this.name = 'MediaTooLargeError';
  }
}

export function assertBoundedInput(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_INPUT_BYTES) {
    throw new MediaTooLargeError(bytes.byteLength);
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Cell size assumed when the terminal never answered `CSI 16 t` (or for the art
 * renderers, when no probe ran at all). Roughly a 10x20px cell (aspect 2.0), which is
 * what a 20px monospace font gives; being wrong only costs letterboxing/a slightly
 * off aspect ratio, never a crash.
 */
export const DEFAULT_CELL_WIDTH_PX = 10;
export const DEFAULT_CELL_HEIGHT_PX = 20;
