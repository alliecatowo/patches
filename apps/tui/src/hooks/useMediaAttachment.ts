import { MEDIA_STATUS, type MediaAttachment } from '@patches/proto';
import { useEffect, useState } from 'react';
import type { PrepareOptions, PreparedImage, TerminalMediaRenderer } from '@patches/terminal-media';

import type { MediaSession } from '../media/media-session.js';

export type MediaAttachmentState =
  { status: 'loading' } | { status: 'ready'; prepared: PreparedImage } | { status: 'error' };

/** Fetches (through `session.cache`) and prepares one attachment's *thumbnail*
 * derivative for inline Kitty rendering. Only ever called when the caller has already
 * established the terminal is Kitty-capable — the fallback box path
 * (`MediaAttachments`) never touches the network at all, since `MediaAttachment`
 * already carries width/height/mime_type. */
export function useMediaAttachment(
  session: MediaSession,
  renderer: TerminalMediaRenderer,
  attachment: MediaAttachment,
  opts: PrepareOptions,
): MediaAttachmentState {
  const [state, setState] = useState<MediaAttachmentState>({ status: 'loading' });
  // Destructured so the effect below depends on two primitives rather than `opts`'s
  // object identity, which a caller building `{ maxCols, maxRows }` inline would churn
  // on every render and re-trigger this effect (and the network fetch it starts) for no
  // reason.
  const { maxCols, maxRows } = opts;

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      try {
        const accessToken = await session.ensureAccessToken();
        const download = await session.api.getMediaDownload(
          { mediaId: attachment.mediaId },
          accessToken,
        );
        if (download.status !== MEDIA_STATUS.READY) {
          if (!cancelled) setState({ status: 'error' });
          return;
        }
        const url = download.thumbnailUrl !== '' ? download.thumbnailUrl : download.downloadUrl;
        const mime = download.mimeType !== '' ? download.mimeType : attachment.mimeType;
        const { bytes } = await session.cache.getOrFetch(attachment.mediaId, 'thumb', mime, () =>
          fetchBytes(url),
        );
        if (cancelled) return;
        const prepared = await renderer.prepare({ bytes, mime }, { maxCols, maxRows });
        if (cancelled) return;
        setState({ status: 'ready', prepared });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [session, renderer, attachment.mediaId, attachment.mimeType, maxCols, maxRows]);

  return state;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Media download failed (HTTP ${String(response.status)}).`);
  return new Uint8Array(await response.arrayBuffer());
}
