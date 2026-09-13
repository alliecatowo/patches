import type { Post } from '@patches/proto/es';
import { safePageHref } from '../pages/href.js';

export interface ValidatedPostMedia {
  mediaId: string;
  altText: string;
  mimeType: string;
}

/**
 * Extracts valid post media attachments from a `Post` protobuf object.
 * Returns attachments that have a non-empty `mediaId`.
 */
export function extractPostMedia(post: Post): ValidatedPostMedia[] {
  if (!post.media || post.media.length === 0) {
    return [];
  }
  const result: ValidatedPostMedia[] = [];
  for (const item of post.media) {
    if (item.mediaId && item.mediaId.trim() !== '') {
      result.push({
        mediaId: item.mediaId.trim(),
        altText: item.altText ?? '',
        mimeType: item.mimeType ?? '',
      });
    }
  }
  return result;
}

/**
 * Validates a download URL returned for a post media attachment.
 * Reuses `safePageHref` to enforce allowed schemes (`http` / `https`) and lack of control bytes.
 */
export function safeMediaUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  return safePageHref(url);
}
