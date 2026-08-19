import type { Actor } from '@patches/proto/es';

/**
 * The signed-in actor, cached in `localStorage` purely so UI (nav bar, `ProtectedRoute`,
 * per-post "is this me" checks) can read "am I signed in, and as whom" synchronously via
 * `useSyncExternalStore` (`useSession.ts`). The actual access/refresh tokens live in
 * `@patches/client`'s `SessionManager`, backed by `credentialStore.ts` — this store never
 * holds a token, only the bits the UI renders.
 */
export interface AppSession {
  readonly actor: Actor;
}

const STORAGE_KEY = 'patches.web.actor.v1';

type Listener = () => void;

let current: AppSession | null = readFromStorage();
const listeners = new Set<Listener>();

function readFromStorage(): AppSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isAppSession(parsed)) return parsed;
    return null;
  } catch {
    // Corrupt/old-shape localStorage value — treat as signed out rather than throwing.
    return null;
  }
}

function isAppSession(value: unknown): value is AppSession {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['actor'] === 'object' && record['actor'] !== null;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function setActorSession(actor: Actor): void {
  current = { actor };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  notify();
}

export function clearActorSession(): void {
  current = null;
  window.localStorage.removeItem(STORAGE_KEY);
  notify();
}

export function getActorSession(): AppSession | null {
  return current;
}

export function subscribeActorSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
