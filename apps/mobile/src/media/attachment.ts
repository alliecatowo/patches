import type { MediaAttachment } from '@patches/proto/es';

/**
 * Returns a sorted list of media attachments by their position (0-based display order,
 * spec §27). Returns an empty array if undefined or empty.
 */
export function sortMediaAttachments(
  mediaList: readonly MediaAttachment[] | undefined,
): MediaAttachment[] {
  if (!mediaList || mediaList.length === 0) return [];
  return [...mediaList].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}
