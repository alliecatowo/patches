import { Code, ConnectError, type Interceptor } from '@connectrpc/connect';
import { createConnectTransport } from '@patches/client/connect';
import { createPatchesApi, SessionManager } from '@patches/client';
import { AuthService } from '@patches/proto/es';

import { SecureCredentialStore } from './credentialStore.js';

/**
 * Connect protocol base URL (ADR 0016). `EXPO_PUBLIC_`-prefixed env vars are inlined at
 * build time by Expo's Metro config — this is the officially documented way to configure
 * a value per build/environment without `expo-constants` (`docs.expo.dev` env vars guide).
 * Falls back to a local dev server for `expo start` against a locally-run `apps/server`.
 *
 * React Native's bundled globals type `process` loosely (unlike `@types/node`'s
 * `NodeJS.Process`), so `process.env[...]` resolves to `any` here — asserted to its real
 * shape once, at the source, instead of letting `any` propagate into every value derived
 * from `BASE_URL` below.
 */
const env = process.env as Record<string, string | undefined>;
const BASE_URL = env['EXPO_PUBLIC_PATCHES_API_BASE'] ?? 'http://localhost:8080';
const CLIENT_NAME = 'mobile';
const CLIENT_VERSION = '0.1.0';

const credentialStore = new SecureCredentialStore(BASE_URL);

// A transport with no auth interceptor, used only by `sessionManager`'s own
// `RefreshSession` call — reusing the authed transport below would recurse forever were an
// expired access token attached to the refresh request itself (mirrors apps/web/src/api/client.ts).
const refreshTransport = createConnectTransport({ baseUrl: BASE_URL, useBinaryFormat: false });

/** The single source of truth for the signed-in session's tokens. See
 * `apps/web/src/api/client.ts` for why only one `SessionManager` instance may read/write
 * `credentialStore` — this app follows the same rule and never uses `api.session`. */
export const sessionManager = new SessionManager({ transport: refreshTransport, credentialStore });

/**
 * Attaches `authorization: Bearer <token>` to every non-`AuthService` call when signed in,
 * and retries once (via `sessionManager.withSession`'s single-flight refresh) on a
 * `Code.Unauthenticated` failure. `AuthService` itself is skipped: `Login`/`RefreshSession`
 * never need a bearer token, and retrying a failed `RefreshSession` would recurse. Ported
 * from `apps/web/src/api/client.ts`'s `authInterceptor`.
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
    // A second Unauthenticated (or a failed refresh) means the refresh token itself is no
    // longer valid — clear the stored session so the UI stops presenting stale state.
    if (error instanceof ConnectError && error.code === Code.Unauthenticated) {
      await sessionManager.clear();
    }
    throw error;
  }
};

const transport = createConnectTransport({
  baseUrl: BASE_URL,
  useBinaryFormat: false,
  interceptors: [authInterceptor],
});

/** Every RPC client this app uses, built on `@patches/client` (ADR 0016 §9) so this app,
 * the web client, and the TUI share one SDK. `x-request-id`/`x-patches-client*` headers and
 * per-call deadlines are added by `createPatchesApi` itself; only unary RPCs are ever
 * called here — RN `fetch` cannot stream (ADR 0016 §2). */
export const api = createPatchesApi({
  transport,
  clientName: CLIENT_NAME,
  clientVersion: CLIENT_VERSION,
  credentialStore,
});

export function apiBaseUrl(): string {
  return BASE_URL;
}
