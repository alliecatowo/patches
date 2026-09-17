import type { Post } from '@patches/proto/es';
import type { PatchesApi } from '@patches/client';
import { safePageHref } from '../pages/href.js';

export interface PostMediaItem {
  mediaId: string;
  altText: string;
}

/**
 * Extracts normalized media attachments from a `Post`.
 * Checks `post.media` first (which contains full `MediaAttachment` messages with `mediaId` and `altText`),
 * falling back to `post.mediaIds` (string array of IDs with empty alt text) if `post.media` is empty.
 */
export function getPostMediaAttachments(post: Partial<Post>): PostMediaItem[] {
  if (post.media && post.media.length > 0) {
    return post.media.map((item) => ({
      mediaId: item.mediaId,
      altText: item.altText ?? '',
    }));
  }

  return [];
}

type MediaClient = Pick<PatchesApi['media'], 'getMediaDownload'>;

/**
 * Fetches the presigned download URL for a media ID via `GetMediaDownload`
 * and validates it with `safePageHref` (ensuring http/https only, no control bytes).
 * Returns `null` if the fetch fails or the URL is invalid.
 */
export async function resolveMediaDownloadUrl(
  mediaClient: MediaClient,
  mediaId: string,
): Promise<string | null> {
  try {
    const response = await mediaClient.getMediaDownload({ mediaId });
    if (!response.downloadUrl) return null;
    return safePageHref(response.downloadUrl);
  } catch {
    return null;
  }
}
