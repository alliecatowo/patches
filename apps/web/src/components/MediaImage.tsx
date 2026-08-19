import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';

import { api } from '../api/client.js';

export interface MediaImageProps {
  mediaId: string;
  altText: string;
  className?: string | undefined;
}

/**
 * Resolves a `MediaAttachment.media_id` to a real R2 URL via
 * `MediaService.GetMediaDownload` and renders it directly — the browser
 * fetches image bytes straight from R2, never through this app's server
 * (spec §101: never proxy image uploads/downloads through Node).
 */
export function MediaImage({ mediaId, altText, className }: MediaImageProps): JSX.Element | null {
  const query = useQuery({
    queryKey: ['media', mediaId],
    queryFn: () => api.media.getMediaDownload({ mediaId }),
    staleTime: 5 * 60_000,
  });

  const url = query.data?.downloadUrl;
  if (!url) return <div className={className} aria-hidden="true" />;
  return <img className={className} src={url} alt={altText} loading="lazy" />;
}
