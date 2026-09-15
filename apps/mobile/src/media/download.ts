import type { MediaAttachment, Post } from '@patches/proto/es';
import type { PatchesApi } from '@patches/client';
import { safePageHref } from '../pages/href.js';

type MediaClient = PatchesApi['media'];

/**
 * Returns media attachments from a post, returning an empty array if the post is deleted or
 * has no media attachments.
 */
export function getPostMediaAttachments(post: Post): readonly MediaAttachment[] {
  if (post.deleted || !post.media || post.media.length === 0) {
    return [];
  }
  return post.media;
}

/**
 * Fetches the download URL for a media ID using `GetMediaDownload` and validates it with
 * `safePageHref`. Returns the safe HTTP/HTTPS URL string or `null` if the fetch fails or
 * the URL is invalid/unsafe.
 */
export async function resolveMediaUrl(
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
