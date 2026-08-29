import { Code, ConnectError, type Interceptor } from '@connectrpc/connect';
import { createConnectTransport } from '@patches/client/connect';
import { createPatchesApi, SessionManager } from '@patches/client';
import { AuthService, type Session } from '@patches/proto/es';
import { toast } from 'sonner';

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
export const sessionManager = new SessionManager({
  transport: refreshTransport,
  credentialStore,
  // Cross-tab sync (B-169): sign-in/out/refresh in one tab now propagates to the
  // others via the storage event on exactly this key.
  storageKey: credentialStore.storageKey,
});

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
 * Revokes this browser's refresh-token session where possible, then always forgets its
 * local copy. A network failure must not leave an apparently signed-in browser behind.
 */
export async function logoutCurrentSession(): Promise<void> {
  const refreshToken = (await credentialStore.load())?.refreshToken;
  try {
    if (refreshToken !== undefined) await api.auth.logout({ refreshToken });
  } finally {
    await signOut();
  }
}

/**
 * B-161: a session-expiry sign-out (failed refresh, see `authInterceptor` below) happens
 * outside any component — there's no `navigate()` to call — and leaves whatever route was
 * on screen rendering as if still signed in until the user next interacts with it. A
 * toast plus a hard redirect (this module has no router instance to call `.navigate()`
 * on without a circular import through `router.tsx` -> `RootLayout.tsx` -> here) makes
 * the sign-out visible immediately instead of silently.
 */
function notifySessionExpired(): void {
  toast.error('Your session has expired. Please sign in again.');
  window.location.assign('/login');
}

/**
 * `AuthService` RPCs that must never carry a bearer token, either because they are
 * unauthenticated by protocol design (`Login`/`Register`/the various `Begin*Login`/
 * `Poll*Login`/`Complete*Login` pairs — `auth.proto`'s own no-enumeration and
 * credential-login contracts) or because attaching one would recurse
 * (`RefreshSession`, called by `sessionManager` itself to mint a fresh token).
 *
 * Deliberately NOT in this set: `BeginGitHubLogin`/`BeginOidcLogin`. Both serve two
 * callers under one RPC (`auth.proto`'s `AuthService.BeginGitHubLogin` doc) — an
 * anonymous caller logging in with an already-linked credential, and a signed-in caller
 * linking a new one, which per spec §167 "linking ... MUST require an authenticated
 * Patches session". The server tells the two apart by whether a bearer token is present
 * at all (`AuthController.optionalCallerUserId`), so the token must be attached
 * whenever one exists — the fallthrough logic below already does exactly that (skips
 * attaching only when signed out), which is why these two are absent from this set
 * rather than routed through a bespoke third branch.
 */
const ANONYMOUS_AUTH_METHODS: ReadonlySet<string> = new Set([
  'Login',
  'Register',
  'RefreshSession',
  'GetAuthPolicy',
  'VerifyEmail',
  'RequestPasswordReset',
  'ResetPassword',
  'BeginSshLogin',
  'CompleteSshLogin',
  'PollGitHubLogin',
  'PollOidcLogin',
  'BeginDeviceLink',
  'PollDeviceLink',
  'BeginPasskeyLogin',
  'CompletePasskeyLogin',
  'RecoveryLogin',
]);

/**
 * Attaches `authorization: Bearer <token>` to every call when signed in, and retries
 * once (via `sessionManager.withSession`'s single-flight refresh) on a
 * `Code.Unauthenticated` failure — the same behaviour every RPC got before this app used
 * `@patches/client`, just built on the SDK's `SessionManager` instead of hand-rolled
 * refresh/mutex logic. Discriminates per-RPC, not per-service (`ANONYMOUS_AUTH_METHODS`
 * above): most of `AuthService` (`ListCredentials`, `RevokeCredential`,
 * `GenerateRecoveryCodes`, `BeginPasskeyRegistration`, credential-linking `BeginGitHubLogin`/
 * `BeginOidcLogin`, etc.) requires exactly the same bearer token every other service's
 * RPCs do.
 */
const authInterceptor: Interceptor = (next) => async (req) => {
  if (
    req.service.typeName === AuthService.typeName &&
    ANONYMOUS_AUTH_METHODS.has(req.method.name)
  ) {
    return next(req);
  }
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
      notifySessionExpired();
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
