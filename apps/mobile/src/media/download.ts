import type { PatchesApi } from '@patches/client';
import { safePageHref } from '../pages/href.js';

type MediaClient = PatchesApi['media'];

/**
 * Fetches a media attachment's download URL from the server via `GetMediaDownload`,
 * and validates that the URL is an http(s) URL without control or unsafe characters (via `safePageHref`).
 * Returns the validated URL string or `null` if invalid, unsafe, missing, or if the request fails.
 */
export async function fetchSafeMediaDownloadUrl(
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
