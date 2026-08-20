import type { Actor, Session } from '@patches/proto/es';

import { api, sessionManager } from './client.js';

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
export async function restoreSession(): Promise<Actor | null> {
  const token = await sessionManager.getAccessToken();
  if (token === undefined) return null;
  try {
    const response = await sessionManager.withSession((accessToken) =>
      api.auth.getCurrentSession({}, { headers: { authorization: `Bearer ${accessToken}` } }),
    );
    setCurrentActor(response.actor ?? null);
    return getCurrentActor();
  } catch {
    // The refresh token itself is invalid/expired — the caller must sign in again.
    await sessionManager.clear();
    setCurrentActor(null);
    return null;
  }
}
