import type { PatchesApi } from '@patches/client';

import { safePageHref } from '../pages/href.js';

type MediaClient = Pick<PatchesApi['media'], 'getMediaDownload'>;

/**
 * Resolves a media ID to a safe, direct-to-R2 download URL via `MediaService.GetMediaDownload`.
 * Re-validates the returned URL via `safePageHref` (spec §104/§172 — http(s) scheme only,
 * control/escape bytes rejected) before handing it to the caller.
 */
export async function resolveMediaDownloadUrl(
  mediaClient: MediaClient,
  mediaId: string,
): Promise<string | null> {
  if (mediaId.trim() === '') return null;
  try {
    const response = await mediaClient.getMediaDownload({ mediaId });
    if (!response.downloadUrl) return null;
    return safePageHref(response.downloadUrl);
  } catch {
    return null;
  }
}
