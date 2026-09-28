import type { MediaAttachment, Post } from '@patches/proto/es';

import { safePageHref } from '../pages/href.js';

/**
 * Returns the list of media attachments for a post. If the post is tombstoned/deleted or
 * has no media attached, returns an empty array.
 */
export function getPostMediaAttachments(post: Post): readonly MediaAttachment[] {
  if (post.deleted || !post.media || post.media.length === 0) {
    return [];
  }
  return post.media;
}

/**
 * Sanitizes and validates a media download URL returned from `GetMediaDownload`,
 * ensuring it uses an http(s) scheme and contains no unsafe control/escape characters.
 */
export function resolveSafeMediaUrl(downloadUrl: string): string | null {
  return safePageHref(downloadUrl);
}
