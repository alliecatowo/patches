import type { MediaAttachment, Post } from '@patches/proto/es';

import { safePageHref } from '../pages/href.js';

/**
 * Returns media attachments to display for a post.
 * Deleted posts return an empty array (spec §25: deleted posts render no body/media).
 */
export function getPostMediaItems(post: Post): readonly MediaAttachment[] {
  if (post.deleted) return [];
  return post.media ?? [];
}

/**
 * Validates a download URL returned by `GetMediaDownload`.
 * Re-validates scheme safety (http/https only) before handing to React Native `Image`.
 */
export function validateMediaDownloadUrl(rawUrl: string): string | null {
  return safePageHref(rawUrl);
}
