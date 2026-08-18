import { randomUUID } from 'node:crypto';

import { credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import {
  createActorClient,
  createAuthClient,
  createFeedClient,
  createNodeClient,
  createPostClient,
  createSocialGraphClient,
  createSystemClient,
  DEADLINES_MS,
  METADATA_KEYS,
  type ActorGrpcClient,
  type AddCredentialRequest,
  type AddCredentialResponse,
  type AuthGrpcClient,
  type BeginSshLoginRequest,
  type BeginSshLoginResponse,
  type CompleteSshLoginRequest,
  type CompleteSshLoginResponse,
  type CreatePostRequest,
  type CreatePostResponse,
  type FeedGrpcClient,
  type FollowActorRequest,
  type FollowActorResponse,
  type GetActorByHandleRequest,
  type GetActorByHandleResponse,
  type GetActorRequest,
  type GetActorResponse,
  type GetCurrentSessionResponse,
  type GetNodeInfoResponse,
  type GetRelationshipRequest,
  type GetRelationshipResponse,
  type GetServerInfoResponse,
  type ListActorPostsRequest,
  type ListActorPostsResponse,
  type ListCredentialsResponse,
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type LoginRequest,
  type LoginResponse,
  type LogoutAllSessionsResponse,
  type LogoutRequest,
  type LogoutResponse,
  type NodeGrpcClient,
  type PingResponse,
  type PostGrpcClient,
  type RefreshSessionRequest,
  type RefreshSessionResponse,
  type RegisterRequest,
  type RegisterResponse,
  type RevokeCredentialRequest,
  type RevokeCredentialResponse,
  type SearchActorsRequest,
  type SearchActorsResponse,
  type SocialGraphGrpcClient,
  type SystemGrpcClient,
  type UnfollowActorRequest,
  type UnfollowActorResponse,
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
  private readonly actor: ActorGrpcClient;
  private readonly post: PostGrpcClient;
  private readonly feed: FeedGrpcClient;
  private readonly socialGraph: SocialGraphGrpcClient;
  private readonly node: NodeGrpcClient;

  constructor(options: ClientOptions) {
    this.target = options.target;
    const channelCredentials = options.insecure
      ? credentials.createInsecure()
      : credentials.createSsl();
    this.system = createSystemClient(options.target, channelCredentials);
    this.auth = createAuthClient(options.target, channelCredentials);
    this.actor = createActorClient(options.target, channelCredentials);
    this.post = createPostClient(options.target, channelCredentials);
    this.feed = createFeedClient(options.target, channelCredentials);
    this.socialGraph = createSocialGraphClient(options.target, channelCredentials);
    this.node = createNodeClient(options.target, channelCredentials);
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

  /** Adds a PASSWORD or SSH_PUBLIC_KEY credential to the caller's account (spec §165). */
  async addCredential(
    request: AddCredentialRequest,
    accessToken: string,
  ): Promise<AddCredentialResponse> {
    return unary(this.auth.addCredential.bind(this.auth), request, DEADLINES_MS.auth, accessToken);
  }

  /** Server-side fails this on the account's last remaining credential (spec §165). */
  async revokeCredential(
    request: RevokeCredentialRequest,
    accessToken: string,
  ): Promise<RevokeCredentialResponse> {
    return unary(
      this.auth.revokeCredential.bind(this.auth),
      request,
      DEADLINES_MS.auth,
      accessToken,
    );
  }

  // ---- ActorService / FeedService — public reads, no access token required ----

  async getActor(request: GetActorRequest): Promise<GetActorResponse> {
    return unary(this.actor.getActor.bind(this.actor), request, DEADLINES_MS.unary);
  }

  async getActorByHandle(request: GetActorByHandleRequest): Promise<GetActorByHandleResponse> {
    return unary(this.actor.getActorByHandle.bind(this.actor), request, DEADLINES_MS.unary);
  }

  async searchActors(request: SearchActorsRequest): Promise<SearchActorsResponse> {
    return unary(this.actor.searchActors.bind(this.actor), request, DEADLINES_MS.unary);
  }

  async listActorPosts(request: ListActorPostsRequest): Promise<ListActorPostsResponse> {
    return unary(this.feed.listActorPosts.bind(this.feed), request, DEADLINES_MS.unary);
  }

  async listLocalFeed(request: ListLocalFeedRequest): Promise<ListLocalFeedResponse> {
    return unary(this.feed.listLocalFeed.bind(this.feed), request, DEADLINES_MS.unary);
  }

  // ---- FeedService / SocialGraphService — the caller's own network, requires a session ----

  async listHomeFeed(
    request: ListHomeFeedRequest,
    accessToken: string,
  ): Promise<ListHomeFeedResponse> {
    return unary(this.feed.listHomeFeed.bind(this.feed), request, DEADLINES_MS.unary, accessToken);
  }

  async followActor(
    request: FollowActorRequest,
    accessToken: string,
  ): Promise<FollowActorResponse> {
    return unary(
      this.socialGraph.followActor.bind(this.socialGraph),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async unfollowActor(
    request: UnfollowActorRequest,
    accessToken: string,
  ): Promise<UnfollowActorResponse> {
    return unary(
      this.socialGraph.unfollowActor.bind(this.socialGraph),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async getRelationship(
    request: GetRelationshipRequest,
    accessToken: string,
  ): Promise<GetRelationshipResponse> {
    return unary(
      this.socialGraph.getRelationship.bind(this.socialGraph),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  // ---- NodeService — unauthenticated node discovery (spec §174) ----

  async getNodeInfo(): Promise<GetNodeInfoResponse> {
    return unary(this.node.getNodeInfo.bind(this.node), {}, DEADLINES_MS.unary);
  }

  // ---- PostService — requires an authenticated session ----

  async createPost(request: CreatePostRequest, accessToken: string): Promise<CreatePostResponse> {
    return unary(this.post.createPost.bind(this.post), request, DEADLINES_MS.unary, accessToken);
  }

  close(): void {
    this.system.close();
    this.auth.close();
    this.actor.close();
    this.post.close();
    this.feed.close();
    this.socialGraph.close();
    this.node.close();
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
