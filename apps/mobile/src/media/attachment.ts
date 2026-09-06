import type { GetMediaDownloadRequest, GetMediaDownloadResponse } from '@patches/proto/es';
import { safePageHref } from '../pages/href.js';

export interface ResolveMediaOptions {
  mediaId: string;
  getMediaDownload?: (req: GetMediaDownloadRequest) => Promise<GetMediaDownloadResponse>;
}

/**
 * Resolves a Patches media ID to a presigned download URL via `GetMediaDownload`,
 * validating that the returned URL is a safe http(s) URL.
 * Returns the download URL string, or null if resolution fails or returns an unsafe URL.
 */
export async function resolveMediaDownloadUrl({
  mediaId,
  getMediaDownload,
}: ResolveMediaOptions): Promise<string | null> {
  if (!mediaId || !getMediaDownload) return null;
  try {
    const response = await getMediaDownload({ mediaId });
    return safePageHref(response.downloadUrl);
  } catch {
    return null;
  }
}
