import type { CredentialStore, StoredSession } from '@patches/client';

/**
 * `localStorage`-backed `CredentialStore` (the seam `@patches/client`'s `SessionManager`
 * persists through — ADR 0016 §9), keyed by the node's base URL so a token from one node
 * is never read back for another (ADR 0016 §5: a token is bound to the node that issued
 * it). Deliberately stores only `{ accessToken, refreshToken }` — never the actor or
 * anything display-related; see `session.ts` for that.
 */
export class LocalStorageCredentialStore implements CredentialStore {
  private readonly key: string;

  constructor(nodeBaseUrl: string) {
    this.key = `patches.web.credentials.${nodeBaseUrl}.v1`;
  }

  /** The storage key — feeds `SessionManager`'s cross-tab `storage` listener (B-169). */
  get storageKey(): string {
    return this.key;
  }

  load(): Promise<StoredSession | undefined> {
    if (typeof window === 'undefined') return Promise.resolve(undefined);
    const raw = window.localStorage.getItem(this.key);
    if (raw === null) return Promise.resolve(undefined);
    try {
      const parsed: unknown = JSON.parse(raw);
      return Promise.resolve(isStoredSession(parsed) ? parsed : undefined);
    } catch {
      // Corrupt/old-shape localStorage value — treat as signed out rather than throwing.
      return Promise.resolve(undefined);
    }
  }

  save(session: StoredSession): Promise<void> {
    window.localStorage.setItem(this.key, JSON.stringify(session));
    return Promise.resolve();
  }

  clear(): Promise<void> {
    window.localStorage.removeItem(this.key);
    return Promise.resolve();
  }
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['accessToken'] === 'string' && typeof record['refreshToken'] === 'string';
}
