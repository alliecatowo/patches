import { Code, ConnectError, createClient, type Interceptor } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import {
  ActorService,
  AuthService,
  CommunityService,
  DirectMessageService,
  FeedService,
  MediaService,
  ModerationService,
  NodeService,
  NotificationService,
  PageService,
  PostService,
  ReactionService,
  SocialGraphService,
  SystemService,
  TagService,
} from '@patches/proto/es';

import {
  clearSession,
  fromProtoSession,
  getAccessToken,
  getRefreshToken,
  setSession,
} from './session.js';

/**
 * Connect protocol base URL. Dev proxies `/api` to the live node (vite.config.ts)
 * to sidestep CORS not yet being configured server-side for a web origin;
 * production sets `VITE_PATCHES_API_BASE` to the real node's public origin.
 */
const BASE_URL = (import.meta.env['VITE_PATCHES_API_BASE'] as string | undefined) ?? '/api';
const CLIENT_VERSION = '0.1.0';

const clientMetaInterceptor: Interceptor = (next) => async (req) => {
  req.header.set('x-request-id', crypto.randomUUID());
  req.header.set('x-patches-client', 'web');
  req.header.set('x-patches-client-version', CLIENT_VERSION);
  return next(req);
};

// A transport with no auth interceptor, used only to perform the refresh call
// itself — reusing the authenticated transport here would recurse forever on
// an expired refresh token.
const refreshTransport = createConnectTransport({
  baseUrl: BASE_URL,
  useBinaryFormat: false,
  interceptors: [clientMetaInterceptor],
});
const refreshOnlyAuthClient = createClient(AuthService, refreshTransport);

let refreshInFlight: Promise<boolean> | null = null;

/** Rotates the refresh token once; concurrent callers share the same in-flight attempt. */
async function refreshSessionOnce(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (refreshToken === null) return false;
  refreshInFlight ??= (async () => {
    try {
      const response = await refreshOnlyAuthClient.refreshSession({ refreshToken });
      const stored = response.session ? fromProtoSession(response.session) : null;
      if (stored === null) {
        clearSession();
        return false;
      }
      setSession(stored);
      return true;
    } catch {
      clearSession();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

const authInterceptor: Interceptor = (next) => async (req) => {
  const token = getAccessToken();
  if (token !== null) req.header.set('authorization', `Bearer ${token}`);
  try {
    return await next(req);
  } catch (error) {
    const isAuthService = req.service.typeName === AuthService.typeName;
    if (isAuthService || !(error instanceof ConnectError) || error.code !== Code.Unauthenticated) {
      throw error;
    }
    const refreshed = await refreshSessionOnce();
    if (!refreshed) throw error;
    const retryToken = getAccessToken();
    if (retryToken !== null) req.header.set('authorization', `Bearer ${retryToken}`);
    return next(req);
  }
};

const transport = createConnectTransport({
  baseUrl: BASE_URL,
  useBinaryFormat: false,
  interceptors: [authInterceptor, clientMetaInterceptor],
});

/**
 * Every RPC client the web app uses, built on the shared, auth-aware transport.
 * Kept as one small object so swapping this file's internals for
 * `@patches/client`'s `createPatchesApi({ transport })` later doesn't touch callers.
 */
export const api = {
  system: createClient(SystemService, transport),
  node: createClient(NodeService, transport),
  auth: createClient(AuthService, transport),
  actor: createClient(ActorService, transport),
  socialGraph: createClient(SocialGraphService, transport),
  moderation: createClient(ModerationService, transport),
  feed: createClient(FeedService, transport),
  post: createClient(PostService, transport),
  reaction: createClient(ReactionService, transport),
  notification: createClient(NotificationService, transport),
  tag: createClient(TagService, transport),
  community: createClient(CommunityService, transport),
  directMessage: createClient(DirectMessageService, transport),
  media: createClient(MediaService, transport),
  page: createClient(PageService, transport),
};
