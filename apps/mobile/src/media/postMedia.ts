import type { MediaAttachment } from '@patches/proto/es';

import { api } from '../api/client.js';
import { safePageHref } from '../pages/href.js';

export interface ResolvedMediaAttachment {
  mediaId: string;
  altText: string;
  url: string;
}

/**
 * Resolves a single media attachment's download URL via `GetMediaDownload`,
 * verifying that the resulting URL uses http/https via `safePageHref`.
 */
export async function resolveMediaAttachmentUrl(
  attachment: MediaAttachment,
): Promise<ResolvedMediaAttachment | null> {
  if (!attachment.mediaId) return null;
  try {
    const response = await api.media.getMediaDownload({ mediaId: attachment.mediaId });
    const safe = safePageHref(response.downloadUrl);
    if (safe === null) return null;
    return {
      mediaId: attachment.mediaId,
      altText: attachment.altText,
      url: safe,
    };
  } catch {
    return null;
  }
}
