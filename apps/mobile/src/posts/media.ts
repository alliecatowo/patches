import type { MediaAttachment, Post } from '@patches/proto/es';

export interface MediaItemView {
  mediaId: string;
  altText: string;
  position: number;
}

/**
 * Extracts and sorts post media attachments by position (spec §27's `post_media.position`).
 * Ignores attachments without a valid `mediaId`.
 */
export function extractPostMediaViews(
  post: Pick<Post, 'media'> | { media?: readonly MediaAttachment[] | undefined },
): MediaItemView[] {
  if (!post.media || post.media.length === 0) {
    return [];
  }

  return post.media
    .filter((m): m is MediaAttachment => m !== undefined && m !== null && Boolean(m.mediaId))
    .map((m, idx) => ({
      mediaId: m.mediaId,
      altText: m.altText ?? '',
      position: m.position ?? idx,
    }))
    .sort((a, b) => a.position - b.position);
}
