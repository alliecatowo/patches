/**
 * Object storage key layout (`docs/architecture/media.md`). One media row owns exactly one
 * key prefix, `media/<mediaId>/`, so every object belonging to it — the original upload plus
 * every derivative — can be located (and deleted) from the `mediaId` alone, with no lookup
 * table needed on the storage side.
 */

/** The client's original upload, before processing. */
export function mediaOriginalKey(mediaId: string): string {
  return `media/${mediaId}/original`;
}

/** Worker-generated derivatives (`docs/architecture/media.md` §4: display + thumbnail). */
export const MEDIA_VARIANTS = ['display', 'thumb'] as const;
export type MediaVariant = (typeof MEDIA_VARIANTS)[number];

export function mediaVariantKey(mediaId: string, variant: MediaVariant): string {
  return `media/${mediaId}/v/${variant}`;
}

/** `true` for any key under a given media id's prefix — used by cleanup to find every
 * object (original + all variants) belonging to one `media` row without listing derivative
 * keys individually. */
export function isMediaObjectKey(key: string, mediaId: string): boolean {
  return key === mediaOriginalKey(mediaId) || key.startsWith(`media/${mediaId}/v/`);
}
