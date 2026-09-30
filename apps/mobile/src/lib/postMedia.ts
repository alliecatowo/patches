import type { MediaAttachment } from '@patches/proto/es';
import { safePageHref } from '../pages/href.js';

/**
 * Validates a media download URL obtained from `GetMediaDownloadResponse`.
 * Returns the URL if it uses http/https and contains no control/unsafe bytes, or `null` otherwise.
 */
export function validateMediaDownloadUrl(rawUrl: string | undefined | null): string | null {
  if (rawUrl === undefined || rawUrl === null) return null;
  return safePageHref(rawUrl);
}

/**
 * Extracts and filters valid media attachments from a post.
 */
export function getDisplayMediaAttachments(
  media: readonly MediaAttachment[] | undefined | null,
): readonly MediaAttachment[] {
  if (!media || !Array.isArray(media)) return [];
  return media.filter((item: unknown): item is MediaAttachment => {
    if (item === null || typeof item !== 'object') return false;
    const mediaId = (item as Record<string, unknown>).mediaId;
    return typeof mediaId === 'string' && mediaId.trim() !== '';
  });
}
