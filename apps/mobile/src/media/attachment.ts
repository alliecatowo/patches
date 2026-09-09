import type { PatchesApi } from '@patches/client';
import { safePageHref } from '../pages/href.js';

type MediaClient = PatchesApi['media'];

/**
 * Resolves a media attachment id to a safe http(s) download URL via
 * `MediaService.GetMediaDownload` (spec §30, §101, §176).
 * Returns `null` if the fetch fails or if the URL is not a safe http(s) URL.
 */
export async function fetchSafeMediaUrl(
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
