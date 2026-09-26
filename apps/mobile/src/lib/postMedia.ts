import type { MediaAttachment } from '@patches/proto/es';

import { safePageHref } from '../pages/href.js';

/**
 * Sorts post media attachments in ascending display order (`position` field, spec §27).
 */
export function sortMediaAttachments(
  media: readonly MediaAttachment[] | undefined,
): MediaAttachment[] {
  if (!media || media.length === 0) return [];
  return [...media].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/**
 * Validates and sanitizes a media download URL, returning an http(s) URL string or null if unsafe.
 */
export function getSafeMediaUrl(downloadUrl: string): string | null {
  return safePageHref(downloadUrl);
}

/**
 * Formats and trims alt text for caption display. Returns empty string if blank.
 */
export function formatMediaAltText(altText: string | undefined): string {
  if (!altText) return '';
  return altText.trim();
}
