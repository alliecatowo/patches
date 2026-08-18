import {
  timestampToDate,
  type Actor,
  type BeginSshLoginRequest,
  type BeginSshLoginResponse,
  type CompleteSshLoginRequest,
  type CompleteSshLoginResponse,
  type LoginRequest,
  type LoginResponse,
  type LogoutRequest,
  type LogoutResponse,
  type RefreshSessionRequest,
  type RefreshSessionResponse,
  type RegisterRequest,
  type RegisterResponse,
  type Session,
} from '@patches/proto';

import { grpcStatusCode } from '../api/errors.js';
import { type CredentialStore, type StoredCredential } from './credential-store.js';

/**
 * The auth surface `SessionManager` needs. `PatchesApi` implements it
 * structurally; tests supply a smaller fake typed against the same shape
 * (spec: "typed mock of the auth client").
 */
export interface SessionAuthApi {
  register(request: RegisterRequest): Promise<RegisterResponse>;
  login(request: LoginRequest): Promise<LoginResponse>;
  refreshSession(request: RefreshSessionRequest): Promise<RefreshSessionResponse>;
  logout(request: LogoutRequest): Promise<LogoutResponse>;
  beginSshLogin(request: BeginSshLoginRequest): Promise<BeginSshLoginResponse>;
  completeSshLogin(request: CompleteSshLoginRequest): Promise<CompleteSshLoginResponse>;
}

export interface ActiveSession {
  nodeOrigin: string;
  userId: string;
  actor: Actor | undefined;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  emailVerified: boolean;
}

/** Thrown by `ensureAccessToken`/`withAuth` once no valid session can be produced. */
export class SessionExpiredError extends Error {
  constructor() {
    super('session expired, run patches login');
    this.name = 'SessionExpiredError';
  }
}

function isUnauthenticated(error: unknown): boolean {
  // 16 == grpc.status.UNAUTHENTICATED — imported by number to avoid pulling
  // @grpc/grpc-js's `status` enum into this file just for one comparison.
  return grpcStatusCode(error) === 16;
}

function requireDate(timestamp: Session['accessExpiresAt'], field: string): Date {
  const date = timestampToDate(timestamp);
  if (date === undefined) throw new Error(`Server session is missing ${field}.`);
  return date;
}

export interface SessionManagerOptions {
  api: SessionAuthApi;
  store: CredentialStore;
  /**
   * The node this manager talks to, used as the `CredentialStore` key (spec
   * §37, §163). For v0 this is the connection target (`--server`); resolving
   * a federation-stable "canonical domain" is out of scope here.
   */
  nodeOrigin: string;
  /** Refresh this many ms before `accessExpiresAt` rather than exactly at it. */
  refreshSkewMs?: number;
}

/**
 * Owns the in-memory access token and drives login/register/refresh/logout,
 * persisting only the refresh token (via `CredentialStore`) and never the
 * access token (spec §35, §37).
 */
export class SessionManager {
  private readonly api: SessionAuthApi;
  private readonly store: CredentialStore;
  private readonly nodeOrigin: string;
  private readonly refreshSkewMs: number;
  private current: ActiveSession | undefined;

  constructor(options: SessionManagerOptions) {
    this.api = options.api;
    this.store = options.store;
    this.nodeOrigin = options.nodeOrigin;
    this.refreshSkewMs = options.refreshSkewMs ?? 30_000;
  }

  get session(): ActiveSession | undefined {
    return this.current;
  }

  /**
   * Looks for a stored refresh token for this node and exchanges it for a
   * fresh session. Resolves to `undefined` (never rejects) when there is
   * nothing stored, or what is stored no longer works — the caller's next
   * step in both cases is the same: show the logged-out UI.
   */
  async restore(userId?: string): Promise<ActiveSession | undefined> {
    const stored = await this.store.get(this.nodeOrigin, userId);
    if (stored === undefined) return undefined;
    try {
      const response = await this.api.refreshSession({ refreshToken: stored.refreshToken });
      return this.applySession(response.session, stored.userId);
    } catch {
      return undefined;
    }
  }

  async register(request: RegisterRequest): Promise<ActiveSession> {
    const response = await this.api.register(request);
    return this.applySession(response.session);
  }

  async loginWithPassword(emailOrHandle: string, password: string): Promise<ActiveSession> {
    const response = await this.api.login({ emailOrHandle, password });
    return this.applySession(response.session);
  }

  /** Applies a session already obtained via `ssh-login.ts`'s `performSshLogin`. */
  applySshLoginResult(response: CompleteSshLoginResponse): Promise<ActiveSession> {
    return Promise.resolve(this.applySession(response.session));
  }

  async logout(): Promise<void> {
    if (this.current === undefined) return;
    const { refreshToken, userId } = this.current;
    try {
      await this.api.logout({ refreshToken });
    } finally {
      await this.store.delete(this.nodeOrigin, userId);
      this.current = undefined;
    }
  }

  /** Returns a token known to be valid for at least `refreshSkewMs`, refreshing first if not. */
  async ensureAccessToken(): Promise<string> {
    if (this.current === undefined) throw new SessionExpiredError();
    if (this.current.accessExpiresAt.getTime() - Date.now() > this.refreshSkewMs) {
      return this.current.accessToken;
    }
    const refreshed = await this.refresh();
    return refreshed.accessToken;
  }

  private async refresh(): Promise<ActiveSession> {
    if (this.current === undefined) throw new SessionExpiredError();
    const response = await this.api.refreshSession({ refreshToken: this.current.refreshToken });
    return this.applySession(response.session, this.current.userId);
  }

  /**
   * Wraps one authenticated call: ensures a fresh token, and on
   * `UNAUTHENTICATED` refreshes exactly once and retries before giving up
   * with {@link SessionExpiredError} ("session expired, run patches login" —
   * the message the CLI/TUI show verbatim).
   */
  async withAuth<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
    const token = await this.ensureAccessToken();
    try {
      return await call(token);
    } catch (error) {
      if (!isUnauthenticated(error)) throw error;
      let refreshed: ActiveSession;
      try {
        refreshed = await this.refresh();
      } catch {
        this.current = undefined;
        throw new SessionExpiredError();
      }
      return call(refreshed.accessToken);
    }
  }

  private applySession(session: Session | undefined, fallbackUserId?: string): ActiveSession {
    if (session === undefined) throw new Error('The server did not return a session.');

    const userId = session.actor?.id ?? fallbackUserId;
    if (userId === undefined) {
      throw new Error('The server session has no actor id to key local storage by.');
    }

    const active: ActiveSession = {
      nodeOrigin: this.nodeOrigin,
      userId,
      actor: session.actor,
      accessToken: session.accessToken,
      accessExpiresAt: requireDate(session.accessExpiresAt, 'access_expires_at'),
      refreshToken: session.refreshToken,
      refreshExpiresAt: requireDate(session.refreshExpiresAt, 'refresh_expires_at'),
      emailVerified: session.emailVerified,
    };
    this.current = active;

    const stored: StoredCredential = {
      nodeOrigin: this.nodeOrigin,
      userId,
      actorHandle: session.actor?.handle ?? '',
      refreshToken: session.refreshToken,
      refreshExpiresAt: active.refreshExpiresAt.toISOString(),
    };
    // Persisting is fire-and-forget from the caller's point of view — a failed
    // write must not fail the login/refresh itself, only mean the next process
    // start has to log in again. `SessionManager` has no logger of its own
    // (spec §68/tui.md: no console.* in the render path), so this is silent by
    // design rather than an oversight.
    this.store.set(stored).catch(() => undefined);

    return active;
  }
}
