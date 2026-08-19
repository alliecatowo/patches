import { Code, ConnectError, type Interceptor } from '@connectrpc/connect';
import { createConnectTransport } from '@patches/client/connect';
import { createPatchesApi, SessionManager } from '@patches/client';
import { AuthService, type Session } from '@patches/proto/es';

import { LocalStorageCredentialStore } from './credentialStore.js';
import { clearActorSession, setActorSession } from './session.js';

/**
 * Connect protocol base URL. Dev proxies `/api` to the live node (vite.config.ts)
 * to sidestep CORS not yet being configured server-side for a web origin;
 * production sets `VITE_PATCHES_API_BASE` to the real node's public origin.
 */
const BASE_URL = (import.meta.env['VITE_PATCHES_API_BASE'] as string | undefined) ?? '/api';
const CLIENT_NAME = 'web';
const CLIENT_VERSION = '0.1.0';

const credentialStore = new LocalStorageCredentialStore(BASE_URL);

// A transport with no interceptor, used only by `sessionManager`'s own `RefreshSession`
// call — reusing the authed transport built below here would recurse forever were an
// expired access token attached to the refresh request itself.
const refreshTransport = createConnectTransport({ baseUrl: BASE_URL, useBinaryFormat: false });

/**
 * The single source of truth for the signed-in session's tokens (ADR 0016 §9). Note
 * `createPatchesApi` below also builds its own internal `SessionManager` (exposed as
 * `api.session`) — that instance is intentionally never used by this app. Only one
 * `SessionManager` may safely read/write `credentialStore`'s in-memory cache at a time
 * (each instance loads it once and caches the result), so using both would let the two
 * silently diverge after a login/refresh/logout done through only one of them.
 * `authInterceptor` and every explicit sign-in/out flow in this app go through this
 * instance instead.
 */
export const sessionManager = new SessionManager({ transport: refreshTransport, credentialStore });

/** Persists a `Session` proto (from `Login`/`Register`) into both the token store and the
 * actor snapshot the UI renders from. */
export async function establishSession(session: Session): Promise<void> {
  if (!session.actor) return;
  await sessionManager.setSession({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  });
  setActorSession(session.actor);
}

/** Signs out locally. Does not call the server — callers issue the `Logout` RPC
 * themselves first if they want to invalidate the refresh token server-side too. */
export async function signOut(): Promise<void> {
  await sessionManager.clear();
  clearActorSession();
}

/**
 * Attaches `authorization: Bearer <token>` to every non-`AuthService` call when signed
 * in, and retries once (via `sessionManager.withSession`'s single-flight refresh) on a
 * `Code.Unauthenticated` failure — the same behaviour every RPC got before this app used
 * `@patches/client`, just built on the SDK's `SessionManager` instead of hand-rolled
 * refresh/mutex logic. `AuthService` itself is skipped both because `Login`/`Register`/
 * `RefreshSession` never need a bearer token and because attempting a refresh in response
 * to a failed `RefreshSession` call would recurse.
 */
const authInterceptor: Interceptor = (next) => async (req) => {
  if (req.service.typeName === AuthService.typeName) return next(req);
  const token = await sessionManager.getAccessToken();
  if (token === undefined) return next(req);
  try {
    return await sessionManager.withSession((accessToken) => {
      req.header.set('authorization', `Bearer ${accessToken}`);
      return next(req);
    });
  } catch (error) {
    // A second Unauthenticated (or a failed refresh) means the refresh token itself is
    // no longer valid — sign out locally so the UI stops presenting stale state.
    if (error instanceof ConnectError && error.code === Code.Unauthenticated) {
      await signOut();
    }
    throw error;
  }
};

const transport = createConnectTransport({
  baseUrl: BASE_URL,
  useBinaryFormat: false,
  interceptors: [authInterceptor],
});

/**
 * Every RPC client the web app uses, built on `@patches/client` (ADR 0016 §9) so this
 * app, the TUI, and React Native share one SDK. `x-request-id`/`x-patches-client*`
 * headers and per-call deadlines are added by `createPatchesApi` itself.
 */
export const api = createPatchesApi({
  transport,
  clientName: CLIENT_NAME,
  clientVersion: CLIENT_VERSION,
  credentialStore,
});
