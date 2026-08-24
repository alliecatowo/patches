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
  private current: StoredSession | undefined;
  private loaded = false;
  private refreshing: Promise<StoredSession> | undefined;

  constructor(options: SessionManagerOptions) {
    this.authClient = createClient(AuthService, options.transport);
    this.store = options.credentialStore ?? new InMemoryCredentialStore();
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
  }

  /** Drops the session (e.g. `Logout`). Does not call the server — callers issue the
   * `Logout` RPC themselves before or after clearing local state. */
  async clear(): Promise<void> {
    this.current = undefined;
    this.loaded = true;
    await this.store.clear();
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
    this.current = await this.store.load();
    this.loaded = true;
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
    return next;
  }
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof ConnectError && error.code === Code.Unauthenticated;
}
