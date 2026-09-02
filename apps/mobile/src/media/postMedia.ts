import type { MediaAttachment } from '@patches/proto/es';
import { safePageHref } from '../pages/href.js';

export interface ResolvedMediaAttachment {
  mediaId: string;
  altText: string;
  url: string | null;
  failed: boolean;
}

export type MediaDownloadFetcher = (req: { mediaId: string }) => Promise<{ downloadUrl?: string }>;

/**
 * Fetches download URLs for a list of `MediaAttachment` items via a `getMediaDownload` fetcher,
 * validating each download URL with `safePageHref`.
 */
export async function resolvePostMediaAttachments(
  attachments: readonly MediaAttachment[],
  getMediaDownload: MediaDownloadFetcher,
): Promise<ResolvedMediaAttachment[]> {
  if (attachments.length === 0) {
    return [];
  }

  return Promise.all(
    attachments.map(async (att) => {
      try {
        const response = await getMediaDownload({ mediaId: att.mediaId });
        const safeUrl = response.downloadUrl ? safePageHref(response.downloadUrl) : null;
        return {
          mediaId: att.mediaId,
          altText: att.altText,
          url: safeUrl,
          failed: safeUrl === null,
        };
      } catch {
        return {
          mediaId: att.mediaId,
          altText: att.altText,
          url: null,
          failed: true,
        };
      }
    }),
  );
}
