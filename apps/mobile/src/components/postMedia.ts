import type { MediaAttachment } from '@patches/proto/es';
import { sanitizeText } from '@patches/domain';

export interface PostMediaAttachmentView {
  mediaId: string;
  altText: string;
}

/**
 * Maps raw `MediaAttachment` proto messages from a post into clean, sanitized view models
 * for rendering in `PostRow`. Filters out attachments without a valid `mediaId` and
 * sanitizes control/newline characters in `altText`.
 */
export function toPostMediaViews(
  attachments: readonly MediaAttachment[] | undefined,
): PostMediaAttachmentView[] {
  if (!attachments || attachments.length === 0) return [];

  const views: PostMediaAttachmentView[] = [];
  for (const attachment of attachments) {
    if (!attachment.mediaId) continue;
    views.push({
      mediaId: attachment.mediaId,
      altText: sanitizeText(attachment.altText ?? '', { multiline: false }),
    });
  }
  return views;
}
