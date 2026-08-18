/**
 * Media upload limits and the v0 format allowlist (`INITIAL_VISION.md` §28,
 * `docs/architecture/media.md` §5).
 *
 * These are shared between the server (which enforces them before issuing a presigned PUT)
 * and the worker (which re-validates against the *real*, decoded file — never trusting the
 * client-declared content type or the server-side check alone, per §31). Mirrors the same
 * numbers `packages/terminal-media`'s `renderer.ts` already uses for decode-side limits
 * (`MAX_INPUT_BYTES` / `limitInputPixels`), duplicated here rather than imported: that
 * package pulls in `ink`/`react` peer expectations that neither the server nor the worker
 * should depend on (layering — a TUI-oriented package is not a shared media-limits module).
 */

/** 10 MB per uploaded image (§28). */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

/** 20 megapixels maximum decoded dimensions (§28) — guards against decompression bombs. */
export const MAX_MEDIA_PIXELS = 20_000_000;

/**
 * Accepted content types for v0 (§28). GIF, SVG, TIFF, PDF, video, and other animated
 * formats are explicitly rejected — not just "not yet supported" — until animated formats
 * are safely and intentionally supported later.
 */
export const ACCEPTED_MEDIA_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AcceptedMediaContentType = (typeof ACCEPTED_MEDIA_CONTENT_TYPES)[number];

export function isAcceptedMediaContentType(value: string): value is AcceptedMediaContentType {
  return (ACCEPTED_MEDIA_CONTENT_TYPES as readonly string[]).includes(value);
}

/** Maps a validated content type to the file extension used nowhere in object keys (the
 * key layout is extension-less, see `keys.ts`) but useful for `Content-Disposition`/logging. */
export const MEDIA_CONTENT_TYPE_EXTENSION: Readonly<Record<AcceptedMediaContentType, string>> =
  Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  });
