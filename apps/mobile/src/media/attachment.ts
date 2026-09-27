import type { PatchesApi } from '@patches/client';
import type { MediaAttachment, Post } from '@patches/proto/es';

import { safePageHref } from '../pages/href.js';

/**
 * Returns a post's media attachments sorted by `position`.
 * Returns an empty array if the post is deleted or has no media.
 */
export function getPostMediaAttachments(post: Post): MediaAttachment[] {
  if (post.deleted || !post.media || post.media.length === 0) {
    return [];
  }
  return [...post.media].sort((a, b) => a.position - b.position);
}

/**
 * Calls `apiClient.media.getMediaDownload({ mediaId })` and validates the resulting URL
 * with `safePageHref`. Returns `null` if fetching fails or if the URL is unsafe/invalid.
 */
export async function resolveMediaUrl(
  apiClient: PatchesApi,
  mediaId: string,
): Promise<string | null> {
  if (!mediaId) {
    return null;
  }
  try {
    const response = await apiClient.media.getMediaDownload({ mediaId });
    if (!response.downloadUrl) {
      return null;
    }
    return safePageHref(response.downloadUrl);
  } catch {
    return null;
  }
}
