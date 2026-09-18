import type { MediaAttachment } from '@patches/proto/es';
import { safePageHref } from '../pages/href.js';

/**
 * Pure helper function to resolve a media download URL by fetching it via `getMediaDownload`
 * and validating it with `safePageHref` (http/https scheme, control character check).
 * Returns `null` if fetching fails or if the resulting URL is invalid/unsafe.
 */
export async function resolveMediaDownloadUrl(
  mediaId: string,
  getMediaDownload: (mediaId: string) => Promise<string>,
): Promise<string | null> {
  if (!mediaId || mediaId.trim() === '') return null;
  try {
    const rawUrl = await getMediaDownload(mediaId);
    return safePageHref(rawUrl);
  } catch {
    return null;
  }
}

/**
 * Checks whether a post or object has non-empty media attachments.
 */
export function hasMediaAttachments(media?: readonly MediaAttachment[] | null): boolean {
  return Boolean(media && media.length > 0);
}
