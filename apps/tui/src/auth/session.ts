import { toDate } from '../api/wire/time.js';
import type {
  Actor,
  BeginSshLoginRequest,
  BeginSshLoginResponse,
  CompleteSshLoginRequest,
  CompleteSshLoginResponse,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  LogoutResponse,
  RecoveryLoginRequest,
  RecoveryLoginResponse,
  RefreshSessionRequest,
  RefreshSessionResponse,
  RegisterRequest,
  RegisterResponse,
  Session,
} from '../api/wire/types.js';

import { setAmbientAccessToken } from '../api/ambient-token.js';

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
  recoveryLogin(request: RecoveryLoginRequest): Promise<RecoveryLoginResponse>;
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

/**
 * Emitted by `withSession` (P12-011) so the shell can push an inline re-auth modal without
 * `SessionManager` importing anything Ink-shaped. `needsReauth` fires once per outstanding
 * request (repeat callers while one is already pending share the same wait, no second modal);
 * `reauthResolved`/`reauthCancelled` tell the modal to close.
 */
export type SessionEvent =
  { type: 'needsReauth' } | { type: 'reauthResolved' } | { type: 'reauthCancelled' };
export type SessionEventListener = (event: SessionEvent) => void;

interface PendingReauth {
  readonly promise: Promise<string>;
  readonly resolve: (accessToken: string) => void;
  readonly reject: (error: unknown) => void;
}

function isUnauthenticated(error: unknown): boolean {
  // 16 == grpc.status.UNAUTHENTICATED — imported by number to avoid pulling
  // @grpc/grpc-js's `status` enum into this file just for one comparison.
  return grpcStatusCode(error) === 16;
}

function requireDate(timestamp: Session['accessExpiresAt'], field: string): Date {
  const date = toDate(timestamp);
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
  private readonly eventListeners = new Set<SessionEventListener>();
  private pendingReauth: PendingReauth | undefined;

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

  /** P15-003: redeems a single-use recovery code, the same way `loginWithPassword` redeems a
   * password. */
  async loginWithRecoveryCode(emailOrHandle: string, code: string): Promise<ActiveSession> {
    const response = await this.api.recoveryLogin({ emailOrHandle, code });
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
      setAmbientAccessToken(undefined);
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
        setAmbientAccessToken(undefined);
        throw new SessionExpiredError();
      }
      return call(refreshed.accessToken);
    }
  }

  onSessionEvent(listener: SessionEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  private emit(event: SessionEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }

  /**
   * Like {@link withAuth}, but never loses the caller's work to a session expiry (P12-011,
   * spec: "Session expiry never loses a draft"). On `UNAUTHENTICATED` that survives a refresh,
   * instead of throwing immediately this emits `needsReauth` and waits for the shell to call
   * {@link completeReauth} (or {@link cancelReauth}) — every `withSession` call already waiting
   * shares the same wait, so a burst of failing requests shows exactly one re-auth modal, not
   * one per request. Nothing here touches a compose draft or navigation state; that is by
   * construction — this only ever retries `call`, never anything else.
   */
  async withSession<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
    try {
      return await this.withAuth(call);
    } catch (error) {
      if (!(error instanceof SessionExpiredError)) throw error;
      const accessToken = await this.requestReauth();
      return call(accessToken);
    }
  }

  private requestReauth(): Promise<string> {
    if (this.pendingReauth === undefined) {
      let resolve!: PendingReauth['resolve'];
      let reject!: PendingReauth['reject'];
      const promise = new Promise<string>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      this.pendingReauth = { promise, resolve, reject };
      this.emit({ type: 'needsReauth' });
    }
    // A second (or third, …) caller while one modal is already up piggy-backs on the same
    // promise — a JS `Promise` can be awaited by any number of callers, so no fan-out
    // bookkeeping is needed beyond returning it.
    return this.pendingReauth.promise;
  }

  /**
   * Called by the shell's re-auth modal on a successful password sign-in. Resolves every
   * `withSession` call currently waiting with the freshly issued access token, each of which
   * then replays its own original request.
   */
  async completeReauth(emailOrHandle: string, password: string): Promise<void> {
    const active = await this.loginWithPassword(emailOrHandle, password);
    const pending = this.pendingReauth;
    this.pendingReauth = undefined;
    pending?.resolve(active.accessToken);
    this.emit({ type: 'reauthResolved' });
  }

  /**
   * Called by the shell when the viewer dismisses the re-auth modal (`Esc`) without signing
   * in. Every waiting `withSession` call rejects with the same {@link SessionExpiredError} it
   * would have thrown without this mechanism — the caller's existing error handling (and its
   * draft) is unaffected either way.
   */
  cancelReauth(): void {
    const pending = this.pendingReauth;
    this.pendingReauth = undefined;
    pending?.reject(new SessionExpiredError());
    this.emit({ type: 'reauthCancelled' });
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
    // B-040: every RPC without an explicit token now falls back to this one, so reads made
    // by a signed-in user are authenticated even on a node that forbids anonymous reads.
    setAmbientAccessToken(active.accessToken);

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
