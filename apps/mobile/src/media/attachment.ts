import type { PatchesApi } from '@patches/client';
import { safePageHref } from '../pages/href.js';

type MediaClient = PatchesApi['media'];

/**
 * Resolves a media attachment's `mediaId` to a safe HTTP(S) download URL via `GetMediaDownload`.
 * Returns `null` if the request fails, or if the returned URL is empty or unsafe (e.g. non-http(s) scheme or contains control characters).
 */
export async function resolveMediaDownloadUrl(
  mediaClient: MediaClient,
  mediaId: string,
): Promise<string | null> {
  try {
    const response = await mediaClient.getMediaDownload({ mediaId });
    if (!response.downloadUrl) return null;
    return safePageHref(response.downloadUrl);
  } catch {
    return null;
  }
}
