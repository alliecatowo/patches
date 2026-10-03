import { createContext, useContext, type ReactNode } from 'react';

import type { PatchesApi } from '../api/client.js';
import type { MediaCache } from './cache.js';

/**
 * Everything a post row needs to fetch/cache/open an attachment, bundled into one
 * context value so `PostRow` (rendered many layers below `App`, through `PostList` and
 * five different screens) doesn't need `api`/`mediaCache`/`ensureAccessToken` threaded
 * through every screen's props individually — one provider at the top of `App`, one
 * `useOptionalMediaSession()` in `MediaAttachments`.
 */
export interface MediaSession {
  api: PatchesApi;
  cache: MediaCache;
  /** Resolves a fresh access token, refreshing first if needed — `GetMediaDownload`
   * requires a session (server-side `AuthGuard`), so an anonymous viewer's attachments
   * always render as the fallback box, never a network error in the UI. */
  ensureAccessToken: () => Promise<string>;
}

const MediaSessionContext = createContext<MediaSession | undefined>(undefined);

export interface MediaSessionProviderProps {
  session: MediaSession;
  children: ReactNode;
}

export function MediaSessionProvider({ session, children }: MediaSessionProviderProps): ReactNode {
  return <MediaSessionContext.Provider value={session}>{children}</MediaSessionContext.Provider>;
}

/** The session from the nearest `<MediaSessionProvider>`, or `undefined` outside one
 * (e.g. `PostRow`'s own unit tests) — callers fall back to attachment-metadata-only
 * rendering rather than throwing. */
export function useOptionalMediaSession(): MediaSession | undefined {
  return useContext(MediaSessionContext);
}
