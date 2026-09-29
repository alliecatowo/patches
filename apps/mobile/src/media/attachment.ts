import type { PatchesApi } from '@patches/client';

import { safePageHref } from '../pages/href.js';

export type MediaClient = PatchesApi['media'];

/**
 * Resolves a `mediaId` to a safe download URL via `api.media.getMediaDownload`.
 * Validates that the returned URL uses an allowed HTTP/HTTPS scheme and contains no unsafe bytes.
 * Returns `null` if the fetch fails or if the URL is unsafe/invalid.
 */
export async function resolveMediaDownloadUrl(
  media: MediaClient,
  mediaId: string,
): Promise<string | null> {
  try {
    const response = await media.getMediaDownload({ mediaId });
    return safePageHref(response.downloadUrl);
  } catch {
    return null;
  }
}
