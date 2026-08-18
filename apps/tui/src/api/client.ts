import { randomUUID } from 'node:crypto';

import { credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import {
  createAuthClient,
  createSystemClient,
  DEADLINES_MS,
  METADATA_KEYS,
  type AuthGrpcClient,
  type BeginSshLoginRequest,
  type BeginSshLoginResponse,
  type CompleteSshLoginRequest,
  type CompleteSshLoginResponse,
  type GetCurrentSessionResponse,
  type GetServerInfoResponse,
  type ListCredentialsResponse,
  type LoginRequest,
  type LoginResponse,
  type LogoutAllSessionsResponse,
  type LogoutRequest,
  type LogoutResponse,
  type PingResponse,
  type RefreshSessionRequest,
  type RefreshSessionResponse,
  type RegisterRequest,
  type RegisterResponse,
  type SystemGrpcClient,
} from '@patches/proto';

import { CLIENT_NAME, TUI_VERSION } from '../version.js';

export interface ClientOptions {
  /** `host:port` of the Patches server. */
  target: string;
  /** Skip TLS. Only sensible against a local development server. */
  insecure: boolean;
}

/**
 * The TUI's single door to the network.
 *
 * Everything here is promise-based and always carries a deadline (spec §44) —
 * no call in the TUI may wait forever. React components never touch this
 * directly; they go through `hooks/`/`auth/` (spec §68).
 */
export class PatchesApi {
  readonly target: string;

  private readonly system: SystemGrpcClient;
  private readonly auth: AuthGrpcClient;

  constructor(options: ClientOptions) {
    this.target = options.target;
    const channelCredentials = options.insecure
      ? credentials.createInsecure()
      : credentials.createSsl();
    this.system = createSystemClient(options.target, channelCredentials);
    this.auth = createAuthClient(options.target, channelCredentials);
  }

  async getServerInfo(): Promise<GetServerInfoResponse> {
    return unary<Record<string, never>, GetServerInfoResponse>(
      this.system.getServerInfo.bind(this.system),
      {},
      DEADLINES_MS.unary,
    );
  }

  async ping(nonce: string): Promise<PingResponse> {
    return unary(this.system.ping.bind(this.system), { nonce }, DEADLINES_MS.unary);
  }

  // ---- AuthService — the bootstrap calls, none of which need an existing access token ----

  async register(request: RegisterRequest): Promise<RegisterResponse> {
    return unary(this.auth.register.bind(this.auth), request, DEADLINES_MS.auth);
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    return unary(this.auth.login.bind(this.auth), request, DEADLINES_MS.auth);
  }

  async refreshSession(request: RefreshSessionRequest): Promise<RefreshSessionResponse> {
    return unary(this.auth.refreshSession.bind(this.auth), request, DEADLINES_MS.auth);
  }

  async logout(request: LogoutRequest): Promise<LogoutResponse> {
    return unary(this.auth.logout.bind(this.auth), request, DEADLINES_MS.auth);
  }

  async beginSshLogin(request: BeginSshLoginRequest): Promise<BeginSshLoginResponse> {
    return unary(this.auth.beginSshLogin.bind(this.auth), request, DEADLINES_MS.auth);
  }

  async completeSshLogin(request: CompleteSshLoginRequest): Promise<CompleteSshLoginResponse> {
    return unary(this.auth.completeSshLogin.bind(this.auth), request, DEADLINES_MS.auth);
  }

  // ---- AuthService — calls that require an authenticated session ----

  async getCurrentSession(accessToken: string): Promise<GetCurrentSessionResponse> {
    return unary(this.auth.getCurrentSession.bind(this.auth), {}, DEADLINES_MS.auth, accessToken);
  }

  async logoutAllSessions(accessToken: string): Promise<LogoutAllSessionsResponse> {
    return unary(this.auth.logoutAllSessions.bind(this.auth), {}, DEADLINES_MS.auth, accessToken);
  }

  async listCredentials(accessToken: string): Promise<ListCredentialsResponse> {
    return unary(this.auth.listCredentials.bind(this.auth), {}, DEADLINES_MS.auth, accessToken);
  }

  close(): void {
    this.system.close();
    this.auth.close();
  }
}

/** Per-call metadata required on every RPC (spec §44). */
function callMetadata(accessToken?: string): Metadata {
  const metadata = new Metadata();
  metadata.set(METADATA_KEYS.requestId, randomUUID());
  metadata.set(METADATA_KEYS.client, CLIENT_NAME);
  metadata.set(METADATA_KEYS.clientVersion, TUI_VERSION);
  if (accessToken !== undefined) {
    metadata.set(METADATA_KEYS.authorization, `Bearer ${accessToken}`);
  }
  return metadata;
}

type UnaryMethod<Request, Response> = (
  request: Request,
  metadata: Metadata,
  options: { deadline: Date },
  callback: (error: ServiceError | null, response?: Response) => void,
) => unknown;

async function unary<Request, Response>(
  method: UnaryMethod<Request, Response>,
  request: Request,
  deadlineMs: number,
  accessToken?: string,
): Promise<Response> {
  const deadline = new Date(Date.now() + deadlineMs);
  return new Promise<Response>((resolve, reject) => {
    method(request, callMetadata(accessToken), { deadline }, (error, response) => {
      if (error !== null) {
        reject(error);
        return;
      }
      if (response === undefined) {
        reject(new Error('The server replied with nothing at all.'));
        return;
      }
      resolve(response);
    });
  });
}
