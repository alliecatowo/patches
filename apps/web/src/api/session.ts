import type { Actor, Session } from '@patches/proto/es';
import { timestampDate } from '@bufbuild/protobuf/wkt';

/**
 * Auth session persistence. v0 keeps this deliberately dumb (localStorage, no
 * encryption at rest) — the access/refresh tokens are bearer tokens scoped to
 * this node like any other web session cookie would be. Swapping this for
 * `@patches/client`'s `SessionManager` later only touches this file and
 * `client.ts`'s import of it.
 */

const STORAGE_KEY = 'patches.web.session.v1';

export interface StoredSession {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  actor: Actor;
}

type Listener = () => void;

let current: StoredSession | null = readFromStorage();
const listeners = new Set<Listener>();

function readFromStorage(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStoredSession(parsed)) return parsed;
    return null;
  } catch {
    // Corrupt/old-shape localStorage value — treat as signed out rather than throwing.
    return null;
  }
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['accessToken'] === 'string' &&
    typeof record['refreshToken'] === 'string' &&
    typeof record['actor'] === 'object'
  );
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Converts a `Session` protobuf message from Auth RPCs into stored form. */
export function fromProtoSession(session: Session): StoredSession | null {
  if (!session.actor) return null;
  return {
    accessToken: session.accessToken,
    accessExpiresAt: session.accessExpiresAt
      ? timestampDate(session.accessExpiresAt).toISOString()
      : '',
    refreshToken: session.refreshToken,
    refreshExpiresAt: session.refreshExpiresAt
      ? timestampDate(session.refreshExpiresAt).toISOString()
      : '',
    actor: session.actor,
  };
}

export function setSession(session: StoredSession): void {
  current = session;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  notify();
}

export function clearSession(): void {
  current = null;
  window.localStorage.removeItem(STORAGE_KEY);
  notify();
}

export function getSession(): StoredSession | null {
  return current;
}

export function getAccessToken(): string | null {
  return current?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  return current?.refreshToken ?? null;
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
