import type { PatchesApi } from '@patches/client';
import { safePageHref } from '../pages/href.js';

type MediaClient = PatchesApi['media'];

/**
 * Resolves a `MediaAttachment.media_id` to an http(s) download URL via `GetMediaDownload`.
 * Returns `null` if the fetch fails, or if the URL is not a safe http(s) URL.
 */
export async function resolveMediaUrl(media: MediaClient, mediaId: string): Promise<string | null> {
  if (!mediaId) return null;
  try {
    const response = await media.getMediaDownload({ mediaId });
    if (!response.downloadUrl) return null;
    return safePageHref(response.downloadUrl);
  } catch {
    return null;
  }
}
