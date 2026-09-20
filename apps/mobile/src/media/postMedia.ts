import type { MediaAttachment } from '@patches/proto/es';
import { sanitizeText } from '@patches/domain';

export interface PostMediaItem {
  mediaId: string;
  altText: string;
  width: number;
  height: number;
  mimeType: string;
}

/**
 * Prepares post media attachments for rendering (spec §28, §172, B-084).
 * Filters out invalid entries (empty or missing mediaId), sanitizes alt text,
 * and caps the attachments list at 4 items (spec §28).
 */
export function toPostMediaItems(
  mediaAttachments: readonly MediaAttachment[] | undefined,
): PostMediaItem[] {
  if (!mediaAttachments || mediaAttachments.length === 0) {
    return [];
  }

  const validItems: PostMediaItem[] = [];

  for (const item of mediaAttachments) {
    if (!item || !item.mediaId || item.mediaId.trim() === '') {
      continue;
    }

    validItems.push({
      mediaId: item.mediaId,
      altText: sanitizeText(item.altText ?? '', { multiline: false }),
      width: item.width ?? 0,
      height: item.height ?? 0,
      mimeType: item.mimeType ?? '',
    });

    if (validItems.length >= 4) {
      break;
    }
  }

  return validItems;
}
