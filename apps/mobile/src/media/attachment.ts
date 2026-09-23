import type { GetMediaDownloadResponse, MediaAttachment } from '@patches/proto/es';

import { safePageHref } from '../pages/href.js';

export interface ResolvedMediaAttachment {
  mediaId: string;
  altText: string;
  url: string | null;
  width?: number;
  height?: number;
}

/**
 * Resolves a single post media attachment to a safe download URL via `GetMediaDownload`.
 * If the request fails or the download URL is not a valid http(s) URL, returns `url: null`.
 */
export async function resolveMediaAttachment(
  attachment: MediaAttachment,
  getMediaDownload: (req: { mediaId: string }) => Promise<GetMediaDownloadResponse>,
): Promise<ResolvedMediaAttachment> {
  try {
    const res = await getMediaDownload({ mediaId: attachment.mediaId });
    const safe = safePageHref(res.downloadUrl);
    return {
      mediaId: attachment.mediaId,
      altText: attachment.altText,
      url: safe,
      width: attachment.width,
      height: attachment.height,
    };
  } catch {
    return {
      mediaId: attachment.mediaId,
      altText: attachment.altText,
      url: null,
      width: attachment.width,
      height: attachment.height,
    };
  }
}

/**
 * Resolves a list of post media attachments in parallel.
 */
export async function resolveMediaAttachments(
  attachments: readonly MediaAttachment[],
  getMediaDownload: (req: { mediaId: string }) => Promise<GetMediaDownloadResponse>,
): Promise<ResolvedMediaAttachment[]> {
  if (attachments.length === 0) return [];
  return Promise.all(
    attachments.map((attachment) => resolveMediaAttachment(attachment, getMediaDownload)),
  );
}
