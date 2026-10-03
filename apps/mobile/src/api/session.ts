import type { Actor, Session } from '@patches/proto/es';

import { isDefinitiveAuthFailure, isTransientError } from '@patches/client';

import { api, sessionManager, setSessionDeadHandler } from './client.js';

/**
 * The signed-in actor the UI renders from. Deliberately in-memory only (no persistence
 * layer of its own, unlike `apps/web`'s `localStorage`-backed actor cache): the tokens
 * `sessionManager` already persists in `expo-secure-store` are enough to restore a session
 * after a cold start via `restoreSession` below, and an `Actor` is not sensitive the way a
 * token is, but there's no benefit to caching it across restarts either — one authenticated
 * round trip on boot is cheap and always fresh.
 */
export type SessionListener = (actor: Actor | null) => void;

let currentActor: Actor | null = null;
const listeners = new Set<SessionListener>();

function notify(): void {
  for (const listener of listeners) listener(currentActor);
}

export function getCurrentActor(): Actor | null {
  return currentActor;
}

export function subscribeSession(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setCurrentActor(actor: Actor | null): void {
  currentActor = actor;
  notify();
}

// A definitively dead session (see `client.ts`) must not leave a signed-in-looking UI behind.
setSessionDeadHandler(() => setCurrentActor(null));

/** Persists a `Session` proto (from `Login`) into the token store and updates the actor
 * the UI renders. */
export async function establishSession(session: Session): Promise<void> {
  if (!session.actor) return;
  await sessionManager.setSession({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  });
  setCurrentActor(session.actor);
}

/** Signs out locally. Does not call the server — a caller who wants the refresh token
 * invalidated server-side too should issue `AuthService.Logout` first. */
export async function signOut(): Promise<void> {
  await sessionManager.clear();
  setCurrentActor(null);
}

/**
 * Restores the signed-in actor from a token already in `expo-secure-store` (i.e. a cold
 * app restart) — `SessionManager` persists tokens, but never the actor itself, so a
 * restart needs one authenticated round trip. `AuthService.GetCurrentSession` is on
 * `AuthService`, which `client.ts`'s `authInterceptor` deliberately skips (same as
 * `apps/web`), so the bearer header is attached explicitly here.
 * `sessionManager.withSession` handles the single-flight refresh-and-retry-once itself, so
 * a token that's simply expired (15m access-token TTL, ADR 0016 §9) still recovers.
 */
export async function restoreSession(
  options: { retryDelaysMs?: readonly number[] } = {},
): Promise<Actor | null> {
  const token = await sessionManager.getAccessToken();
  if (token === undefined) return null;
  const delays = options.retryDelaysMs ?? RESTORE_RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await sessionManager.withSession((accessToken) =>
        api.auth.getCurrentSession({}, { headers: { authorization: `Bearer ${accessToken}` } }),
      );
      setCurrentActor(response.actor ?? null);
      return getCurrentActor();
    } catch (error) {
      if (isDefinitiveAuthFailure(error)) {
        // The refresh token itself is invalid/expired — the caller must sign in again.
        await sessionManager.clear();
        setCurrentActor(null);
        return null;
      }
      // Anything else (timeout while a scale-to-zero Fly machine boots, 502/503, offline)
      // says nothing about the stored tokens: keep them, back off and retry, and if the
      // server stays unreachable surface the error so the app can show "can't reach server"
      // instead of destroying a valid session.
      const delay = delays[attempt];
      if (delay === undefined || !isTransientError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/** Backoff between boot-time restore attempts (1s, 2s, 4s, 8s, 8s). */
const RESTORE_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 8000];
