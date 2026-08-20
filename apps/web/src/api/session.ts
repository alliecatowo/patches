import { create, fromJson, toJson, type JsonValue } from '@bufbuild/protobuf';
import { ActorSchema, type Actor } from '@patches/proto/es';

/**
 * The signed-in actor, cached in `localStorage` purely so UI (nav bar, `ProtectedRoute`,
 * per-post "is this me" checks) can read "am I signed in, and as whom" synchronously via
 * `useSyncExternalStore` (`useSession.ts`). The actual access/refresh tokens live in
 * `@patches/client`'s `SessionManager`, backed by `credentialStore.ts` — this store never
 * holds a token, only the bits the UI renders.
 *
 * Persisted through protobuf-es's own `toJson`/`fromJson` rather than `JSON.stringify`
 * (B-041): an `Actor` carries `google.protobuf.Timestamp` fields whose `seconds` is a
 * **bigint**, and `JSON.stringify` throws `TypeError: Do not know how to serialize a BigInt`
 * on it — which broke every web sign-in, because `setActorSession` runs on the success path
 * of login/register. `toJson` emits the canonical protobuf JSON mapping (timestamps become
 * RFC 3339 strings), and `fromJson` reconstructs a real message, so the rest of the UI keeps
 * working with `Actor` instances exactly as before.
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
    if (!isStoredSession(parsed)) return null;
    return { actor: fromJson(ActorSchema, parsed.actor) };
  } catch {
    // Corrupt, pre-B-041, or otherwise old-shape localStorage value — treat as signed out
    // rather than throwing (a stale cache must never brick the app shell).
    return null;
  }
}

function isStoredSession(value: unknown): value is { actor: JsonValue } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['actor'] === 'object' && record['actor'] !== null;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function setActorSession(actor: Actor): void {
  current = { actor };
  // `create()` first so a plain init-shaped object (tests, and any caller that builds an
  // actor literal) is normalized into a real message — `toJson` rejects anything that isn't
  // one, and a storage write must never be able to throw on the sign-in success path.
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ actor: toJson(ActorSchema, create(ActorSchema, actor)) }),
  );
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
