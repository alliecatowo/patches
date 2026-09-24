import type { MediaAttachment } from '@patches/proto/es';
import { safePageHref } from '../pages/href.js';

/**
 * Returns media attachments sorted by display position (ascending).
 */
export function getSortedMediaAttachments(
  media?: readonly MediaAttachment[],
): MediaAttachment[] {
  if (!media || media.length === 0) return [];
  return [...media].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/**
 * Validates a media download URL returned from `GetMediaDownload`, ensuring it uses
 * an allowed http(s) scheme and contains no control or escape characters.
 */
export function validateMediaDownloadUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;
  return safePageHref(rawUrl);
}

/**
 * Determines whether media attachments should be rendered for a post.
 * Returns false if the post is deleted, content warning is not revealed, or media is empty.
 */
export function shouldRenderMedia(
  post: { deleted?: boolean | undefined; media?: readonly MediaAttachment[] | undefined },
  cwOpen: boolean,
): boolean {
  if (post.deleted) return false;
  if (!cwOpen) return false;
  return Boolean(post.media && post.media.length > 0);
}
