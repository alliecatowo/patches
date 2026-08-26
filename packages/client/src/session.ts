import { Code, ConnectError, createClient, type Client, type Transport } from '@connectrpc/connect';
import { AuthService } from '@patches/proto/es';

/**
 * The subset of `patches.v1.Session` a client needs to keep making calls (spec §163,
 * ADR 0016 §9). Deliberately excludes `actor`/expiry timestamps/`emailVerified` — those
 * belong to application state, not transport plumbing; callers read them off the
 * `LoginResponse`/`RefreshSessionResponse` directly instead.
 */
export interface StoredSession {
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * Pluggable persistence for a `StoredSession`. The web app keys this by node origin in
 * `localStorage` (ADR 0016 §5), RN uses `expo-secure-store`, the TUI keeps its own
 * on-disk credential file (`docs/agents/LEARNINGS.md` — TUI CLI credential-store flag
 * gap) — this package only defines the seam and ships the in-memory default for tests
 * and short-lived scripts.
 */
export interface CredentialStore {
  load(): Promise<StoredSession | undefined>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

/** Default store: lives only as long as the process. Never persists a token to disk. */
export class InMemoryCredentialStore implements CredentialStore {
  private session: StoredSession | undefined;

  load(): Promise<StoredSession | undefined> {
    return Promise.resolve(this.session);
  }

  save(session: StoredSession): Promise<void> {
    this.session = session;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.session = undefined;
    return Promise.resolve();
  }
}

export interface SessionManagerOptions {
  /** The transport used to call `AuthService.RefreshSession` — the same one `createPatchesApi`
   * builds its clients on, so a refresh never talks to a different node than the caller. */
  readonly transport: Transport;
  readonly credentialStore?: CredentialStore;
  /**
   * The `localStorage` key the credential store persists under, opt-in (B-169). When set
   * (and a `window` exists — web only; the TUI/RN never pass this), the manager listens
   * for `storage` events on exactly this key so login/logout/token rotation in another
   * tab of the same origin is adopted here instead of discovered on the next 401. The
   * key must match what the `CredentialStore` writes — e.g. the web app's
   * `LocalStorageCredentialStore` key for the same node base URL.
   */
  readonly storageKey?: string;
}

/**
 * `CustomEvent` fired on `window` (B-169) once a refresh has replaced the held tokens —
 * whether minted by this tab's own `RefreshSession` call or adopted from another tab's
 * rotation. UI uses it to re-read anything derived from the access token. The event
 * carries only the expiry timestamp, never the token or any other claim value.
 */
export const SESSION_REFRESHED_EVENT = 'patches:session-refreshed';

/** `detail` of the {@link SESSION_REFRESHED_EVENT} `CustomEvent`. */
export interface SessionRefreshedDetail {
  /** New access token's `exp` as ms since epoch, or `undefined` if unparseable. */
  readonly expiresAt: number | undefined;
}

/**
 * Reactive view of the held session for `useSyncExternalStore` consumers: what changed
 * and nothing secret. `signedIn` is false until the credential store's first (async)
 * load resolves — a snapshot is never a promise, so "not loaded yet" and "signed out"
 * are indistinguishable by design; either way there is no usable token yet.
 */
export interface SessionSnapshot {
  readonly signedIn: boolean;
  /** Current access token's `exp` (decoded JWT) as ms since epoch — `undefined` when
   * signed out or the token is malformed/opaque. A UI hint only; the server stays the
   * authority on authentication. */
  readonly expiresAt: number | undefined;
}

type SessionListener = () => void;

const SIGNED_OUT_SNAPSHOT: SessionSnapshot = Object.freeze({
  signedIn: false,
  expiresAt: undefined,
});

/**
 * Extracts `exp` from a JWT's payload and returns it as ms since epoch, without any
 * signature check (a client can't verify the signature anyway — it has no key; expiry
 * here is a UI hint, the server remains the authority). Malformed, opaque, or
 * non-JWT tokens return `undefined` instead of throwing — an unreadable token simply
 * has no known expiry. No dependency: base64url → `atob` → UTF-8 decode.
 */
export function decodeJwtExpiry(token: string): number | undefined {
  const segments = token.split('.');
  if (segments.length !== 3) return undefined;
  const payloadSegment = segments[1];
  if (payloadSegment === undefined) return undefined;
  try {
    const payload: unknown = JSON.parse(decodeBase64UrlUtf8(payloadSegment));
    if (typeof payload !== 'object' || payload === null) return undefined;
    const exp = (payload as Record<string, unknown>)['exp'];
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return undefined;
    return exp * 1000;
  } catch {
    // Bad base64/JSON — treat as "no known expiry" rather than throwing.
    return undefined;
  }
}

/** Decodes a base64url-encoded UTF-8 JSON string. Throws on invalid input; callers catch. */
function decodeBase64UrlUtf8(value: string): string {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function emitSessionRefreshed(accessToken: string): void {
  // Non-browser runtimes (TUI) and test environments without a DOM simply get no event;
  // the snapshot/subscribe seam below still notifies subscribers there.
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  if (typeof CustomEvent !== 'function') return;
  window.dispatchEvent(
    new CustomEvent<SessionRefreshedDetail>(SESSION_REFRESHED_EVENT, {
      detail: { expiresAt: decodeJwtExpiry(accessToken) },
    }),
  );
}

/**
 * Holds the caller's access/refresh token pair and refreshes it on demand.
 *
 * There is deliberately no automatic "attach this to every call" behaviour: only the
 * caller knows which RPCs are anonymous (spec §51 — `GetPost`/`GetActor` etc. work
 * signed out) versus which require a session, so `withSession` hands the current access
 * token to the caller's own closure rather than an interceptor guessing from the method
 * name.
 */
export class SessionManager {
  private readonly authClient: Client<typeof AuthService>;
  private readonly store: CredentialStore;
  private readonly storageKey: string | undefined;
  private current: StoredSession | undefined;
  private loaded = false;
  private refreshing: Promise<StoredSession> | undefined;
  private readonly listeners = new Set<SessionListener>();
  private snapshot: SessionSnapshot = SIGNED_OUT_SNAPSHOT;

  constructor(options: SessionManagerOptions) {
    this.authClient = createClient(AuthService, options.transport);
    this.store = options.credentialStore ?? new InMemoryCredentialStore();
    this.storageKey = options.storageKey;
    // Cross-tab sync (B-169): `storage` fires in every *other* document of the origin,
    // never the one that wrote — exactly the signal this tab needs. Keyed strictly to
    // our own credential key so unrelated localStorage churn is ignored (`key === null`,
    // i.e. a cross-key `clear()`, is ignored for the same reason).
    if (
      this.storageKey !== undefined &&
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function'
    ) {
      window.addEventListener('storage', this.handleStorageEvent);
    }
  }

  /**
   * Subscribes to every change of the held session — login, logout, refresh, or a
   * cross-tab `storage` event. Pairs with {@link getSnapshot} for `useSyncExternalStore`.
   * Subscribing also kicks the (async) credential-store load, so a fresh subscriber
   * isn't stuck on the pre-load signed-out snapshot when no RPC has run yet.
   */
  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    // Load failure leaves the signed-out snapshot in place; the next RPC attempt
    // re-loads and surfaces the real store error through its caller.
    void this.ensureLoaded().catch(() => undefined);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Cached snapshot — the same object reference until the session actually changes,
   * which is what `useSyncExternalStore`'s identity check requires. */
  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  /** The current access token's `exp` as ms since epoch, or `undefined` when signed
   * out / not yet loaded / the token has no parseable `exp` (B-169 proactive-refresh UI). */
  async getExpiresAt(): Promise<number | undefined> {
    await this.ensureLoaded();
    return this.snapshot.expiresAt;
  }

  /** The current access token, if any — loads from the credential store on first use. */
  async getAccessToken(): Promise<string | undefined> {
    await this.ensureLoaded();
    return this.current?.accessToken;
  }

  /** Replaces the held session (e.g. right after `Login`) and persists it. */
  async setSession(session: StoredSession): Promise<void> {
    this.current = session;
    this.loaded = true;
    await this.store.save(session);
    this.commit();
  }

  /** Drops the session (e.g. `Logout`). Does not call the server — callers issue the
   * `Logout` RPC themselves before or after clearing local state. */
  async clear(): Promise<void> {
    this.current = undefined;
    this.loaded = true;
    await this.store.clear();
    this.commit();
  }

  /**
   * Runs `fn` with the current access token. If `fn` rejects with a Connect
   * `Code.Unauthenticated` error, refreshes once (single-flight — concurrent callers
   * share one in-flight refresh, ADR 0016 §9) and retries `fn` exactly once with the new
   * token. A second `Unauthenticated` is not retried again — it propagates, meaning the
   * refresh token itself is no longer valid and the caller must sign in again.
   */
  async withSession<T>(fn: (accessToken: string) => Promise<T>): Promise<T> {
    const token = await this.getAccessToken();
    if (token === undefined) {
      throw new ConnectError('Not signed in.', Code.Unauthenticated);
    }
    try {
      return await fn(token);
    } catch (error) {
      if (!isUnauthenticated(error)) throw error;
      let refreshed: StoredSession;
      try {
        refreshed = await this.refresh();
      } catch (refreshError) {
        // The refresh token itself is dead (rotated-then-reused, expired, or family
        // revoked). Holding onto it guarantees an infinite 401→refresh→fail loop that
        // hammers the node's reuse-detection every retry — drop the pair and surface
        // "not signed in" so the caller routes to sign-in instead.
        await this.clear();
        throw refreshError;
      }
      return fn(refreshed.accessToken);
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const stored = await this.store.load();
    // A setSession/clear (or cross-tab reload) that landed while this read was in
    // flight has already published newer state — its result wins over this stale read.
    if (this.loaded) return;
    this.current = stored;
    this.loaded = true;
    this.commit();
  }

  /**
   * `storage` listener (B-169 cross-tab): another tab wrote or removed our credential
   * key. Never parses `event.newValue` — the `CredentialStore` owns the encoding — just
   * re-reads through it so this tab adopts whatever the other tab persisted.
   */
  private readonly handleStorageEvent = (event: StorageEvent): void => {
    if (this.storageKey === undefined || event.key !== this.storageKey) return;
    // Read failure keeps the last-known snapshot; the next RPC re-loads and surfaces
    // the real store error through its caller.
    void this.reloadFromCredentialStore().catch(() => undefined);
  };

  private async reloadFromCredentialStore(): Promise<void> {
    this.current = await this.store.load();
    this.loaded = true;
    this.commit();
  }

  /** Recomputes the snapshot from the held session and wakes every subscriber. */
  private commit(): void {
    const token = this.current?.accessToken;
    this.snapshot =
      token === undefined
        ? SIGNED_OUT_SNAPSHOT
        : { signedIn: true, expiresAt: decodeJwtExpiry(token) };
    for (const listener of this.listeners) listener();
  }

  private async refresh(): Promise<StoredSession> {
    if (this.refreshing === undefined) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<StoredSession> {
    await this.ensureLoaded();
    const refreshToken = this.current?.refreshToken;
    if (refreshToken === undefined) {
      throw new ConnectError('No session to refresh.', Code.Unauthenticated);
    }
    // Cross-tab guard: another tab may have ALREADY rotated this exact token and
    // persisted the successor. Re-loading first turns the two-tab race from "loser's
    // duplicate refresh flags reuse and revokes the whole family" into "loser adopts
    // the winner's pair". Only hit the network when the stored token is still ours.
    const stored = await this.store.load();
    if (stored !== undefined && stored.refreshToken !== refreshToken) {
      this.current = stored;
      this.commit();
      // From this tab's point of view the tokens were just refreshed (by the other
      // tab) — announce it exactly like a local refresh so UI reacts identically.
      emitSessionRefreshed(stored.accessToken);
      return stored;
    }
    const response = await this.authClient.refreshSession({ refreshToken });
    if (response.session === undefined) {
      throw new ConnectError('Refresh returned no session.', Code.Unknown);
    }
    // Rotation (ADR 0016 §5): the new refresh token is stored *before* this resolves,
    // so a crash between the RPC and a caller reading the result can't strand the
    // caller on an already-rotated, now-invalid refresh token.
    const next: StoredSession = {
      accessToken: response.session.accessToken,
      refreshToken: response.session.refreshToken,
    };
    await this.setSession(next);
    // Fired at commit time (not on `withSession`'s return) on purpose: the tokens are
    // already rotated and persisted here, so UI reacting now is correct even if the
    // retried call goes on to fail for an unrelated reason. Single-flight means one
    // event per actual rotation, no matter how many callers shared the refresh.
    emitSessionRefreshed(next.accessToken);
    return next;
  }
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof ConnectError && error.code === Code.Unauthenticated;
}
