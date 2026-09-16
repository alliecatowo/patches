import type { MediaAttachment } from '@patches/proto/es';

/**
 * Filters and returns valid media attachments from a post.
 * Excludes undefined/null attachments or attachments missing a non-empty mediaId.
 */
export function getValidMediaAttachments(
  media?: readonly MediaAttachment[] | null,
): MediaAttachment[] {
  if (!media || media.length === 0) return [];
  return media.filter(
    (attachment): attachment is MediaAttachment =>
      Boolean(attachment && typeof attachment.mediaId === 'string' && attachment.mediaId.trim() !== ''),
  );
}

/**
 * Returns a trimmed alt text string if present and non-empty, or null.
 */
export function sanitizeAltText(altText?: string | null): string | null {
  if (!altText) return null;
  const trimmed = altText.trim();
  return trimmed !== '' ? trimmed : null;
}
