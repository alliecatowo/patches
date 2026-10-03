import type { MediaAttachment } from '@patches/proto/es';
import type { PatchesApi } from '@patches/client';
import { safePageHref } from '../pages/href.js';

type MediaClient = PatchesApi['media'];

export interface ResolvedMediaAttachment {
  mediaId: string;
  altText: string;
  url: string | null;
  failed: boolean;
}

/**
 * Resolves a single media attachment's download URL via `GetMediaDownload`,
 * re-validating the URL using `safePageHref`.
 */
export async function resolveMediaDownloadUrl(
  media: MediaClient,
  mediaId: string,
): Promise<string | null> {
  try {
    const response = await media.getMediaDownload({ mediaId });
    if (!response.downloadUrl) return null;
    return safePageHref(response.downloadUrl);
  } catch {
    return null;
  }
}

/**
 * Resolves an array of `MediaAttachment` items to their download URLs in parallel.
 */
export async function resolvePostMediaAttachments(
  media: MediaClient,
  attachments: readonly MediaAttachment[],
): Promise<ResolvedMediaAttachment[]> {
  return Promise.all(
    attachments.map(async (att) => {
      const url = await resolveMediaDownloadUrl(media, att.mediaId);
      return {
        mediaId: att.mediaId,
        altText: att.altText,
        url,
        failed: url === null,
      };
    }),
  );
}
