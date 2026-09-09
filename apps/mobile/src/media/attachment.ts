import type { MediaAttachment, Post } from '@patches/proto/es';
import { safePageHref } from '../pages/href.js';

/**
 * Extract media attachments from a post. Returns an empty array if the post is deleted
 * or carries no media attachments.
 */
export function getPostMediaAttachments(post: Post): readonly MediaAttachment[] {
  if (post.deleted || !post.media || post.media.length === 0) {
    return [];
  }
  return post.media;
}

/**
 * Resolves a Patches media ID to a validated download URL for rendering.
 * Handled via `GetMediaDownload` and checked using `safePageHref` (only http/https URLs,
 * control/escape character rejection). Returns `null` if fetching fails or yields an
 * invalid/unsafe URL.
 */
export async function resolveMediaUrl(
  mediaId: string,
  fetchFn: (req: { mediaId: string }) => Promise<{ downloadUrl: string }>,
): Promise<string | null> {
  try {
    const response = await fetchFn({ mediaId });
    return safePageHref(response.downloadUrl);
  } catch {
    return null;
  }
}
