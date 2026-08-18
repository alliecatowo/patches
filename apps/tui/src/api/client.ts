import { randomUUID } from 'node:crypto';

import { credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import {
  createActorClient,
  createAuthClient,
  createFeedClient,
  createMediaClient,
  createModerationClient,
  createNodeClient,
  createNotificationClient,
  createPageClient,
  createPostClient,
  createReactionClient,
  createSocialGraphClient,
  createSystemClient,
  DEADLINES_MS,
  METADATA_KEYS,
  type ActorGrpcClient,
  type AddCredentialRequest,
  type AddCredentialResponse,
  type AuthGrpcClient,
  type BeginMediaUploadRequest,
  type BeginMediaUploadResponse,
  type BeginSshEnrollmentRequest,
  type BeginSshEnrollmentResponse,
  type BeginSshLoginRequest,
  type BeginSshLoginResponse,
  type BlockActorRequest,
  type BlockActorResponse,
  type BookmarkPostRequest,
  type BookmarkPostResponse,
  type CompleteSshLoginRequest,
  type CompleteSshLoginResponse,
  type CreatePostRequest,
  type CreatePostResponse,
  type DeletePostRequest,
  type DeletePostResponse,
  type FeedGrpcClient,
  type FinalizeMediaUploadRequest,
  type FinalizeMediaUploadResponse,
  type FollowActorRequest,
  type FollowActorResponse,
  type GetActorByHandleRequest,
  type GetActorByHandleResponse,
  type GetActorRequest,
  type GetActorResponse,
  type GetCurrentSessionResponse,
  type GetMediaDownloadRequest,
  type GetMediaDownloadResponse,
  type GetNodeInfoResponse,
  type GetPageRequest,
  type GetPageResponse,
  type GetPostRequest,
  type GetPostResponse,
  type GetRelationshipRequest,
  type GetRelationshipResponse,
  type GetServerInfoResponse,
  type GetUnreadCountRequest,
  type GetUnreadCountResponse,
  type LikePostRequest,
  type LikePostResponse,
  type ListActorPostsRequest,
  type ListActorPostsResponse,
  type ListBlocksRequest,
  type ListBlocksResponse,
  type ListBookmarksRequest,
  type ListBookmarksResponse,
  type ListCredentialsResponse,
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type ListMutualFollowsRequest,
  type ListMutualFollowsResponse,
  type ListMutesRequest,
  type ListMutesResponse,
  type ListNotificationsRequest,
  type ListNotificationsResponse,
  type ListPageRevisionsRequest,
  type ListPageRevisionsResponse,
  type ListPostLikersRequest,
  type ListPostLikersResponse,
  type ListGuestbookRequest,
  type ListGuestbookResponse,
  type ListRepliesRequest,
  type ListRepliesResponse,
  type LoginRequest,
  type LoginResponse,
  type LogoutAllSessionsResponse,
  type LogoutRequest,
  type LogoutResponse,
  type MarkNotificationsReadRequest,
  type MarkNotificationsReadResponse,
  type MediaGrpcClient,
  type ModerationGrpcClient,
  type MuteActorRequest,
  type MuteActorResponse,
  type NodeGrpcClient,
  type NotificationGrpcClient,
  type PageGrpcClient,
  type PingResponse,
  type PostGrpcClient,
  type ReactionGrpcClient,
  type RefreshSessionRequest,
  type RefreshSessionResponse,
  type RegisterRequest,
  type RegisterResponse,
  type RemoveGuestbookEntryRequest,
  type RemoveGuestbookEntryResponse,
  type ReportActorRequest,
  type ReportActorResponse,
  type ReportGuestbookEntryRequest,
  type ReportGuestbookEntryResponse,
  type ReportPostRequest,
  type ReportPostResponse,
  type ResendVerificationResponse,
  type ResolveActorRequest,
  type ResolveActorResponse,
  type RevokeCredentialRequest,
  type RevokeCredentialResponse,
  type SearchActorsRequest,
  type SearchActorsResponse,
  type SignGuestbookRequest,
  type SignGuestbookResponse,
  type SocialGraphGrpcClient,
  type SystemGrpcClient,
  type UnblockActorRequest,
  type UnblockActorResponse,
  type UnbookmarkPostRequest,
  type UnbookmarkPostResponse,
  type UnfollowActorRequest,
  type UnfollowActorResponse,
  type UnlikePostRequest,
  type UnlikePostResponse,
  type UnmuteActorRequest,
  type UnmuteActorResponse,
  type UpdatePageRequest,
  type UpdatePageResponse,
  type UpdateProfileRequest,
  type UpdateProfileResponse,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
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
  private readonly reaction: ReactionGrpcClient;
  private readonly notification: NotificationGrpcClient;
  private readonly moderation: ModerationGrpcClient;
  private readonly media: MediaGrpcClient;
  private readonly page: PageGrpcClient;

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
    this.reaction = createReactionClient(options.target, channelCredentials);
    this.notification = createNotificationClient(options.target, channelCredentials);
    this.moderation = createModerationClient(options.target, channelCredentials);
    this.media = createMediaClient(options.target, channelCredentials);
    this.page = createPageClient(options.target, channelCredentials);
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

  /** The code comes from the verification email — unauthenticated (spec: a fresh
   * account has no session yet when it verifies). */
  async verifyEmail(request: VerifyEmailRequest): Promise<VerifyEmailResponse> {
    return unary(this.auth.verifyEmail.bind(this.auth), request, DEADLINES_MS.auth);
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

  /** Issues a possession-proof challenge for an SSH key about to be enrolled (B-021). */
  async beginSshEnrollment(
    request: BeginSshEnrollmentRequest,
    accessToken: string,
  ): Promise<BeginSshEnrollmentResponse> {
    return unary(
      this.auth.beginSshEnrollment.bind(this.auth),
      request,
      DEADLINES_MS.auth,
      accessToken,
    );
  }

  async resendVerification(accessToken: string): Promise<ResendVerificationResponse> {
    return unary(this.auth.resendVerification.bind(this.auth), {}, DEADLINES_MS.auth, accessToken);
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

  /** Resolves a remote `user@domain` handle (no `acct:` prefix) via WebFinger, requires a
   * session. Rejects local-domain accounts with a validation error; throws a gRPC
   * `NOT_IMPLEMENTED` when the node has federation disabled (spec B-028). */
  async resolveActor(
    request: ResolveActorRequest,
    accessToken: string,
  ): Promise<ResolveActorResponse> {
    return unary(
      this.actor.resolveActor.bind(this.actor),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  /** Partial update of the caller's own profile, driven by `updateMask` — only the
   * fields listed there (snake_case proto field names, e.g. `'display_name'`) are
   * applied server-side (spec: `actors.proto`'s `UpdateProfileRequest`). */
  async updateProfile(
    request: UpdateProfileRequest,
    accessToken: string,
  ): Promise<UpdateProfileResponse> {
    return unary(
      this.actor.updateProfile.bind(this.actor),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
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

  /** Actors who follow the given actor back (mutual follows), i.e. "Friends". Public read —
   * `accessToken` is forwarded when present but not required. */
  async listMutualFollows(
    request: ListMutualFollowsRequest,
    accessToken?: string,
  ): Promise<ListMutualFollowsResponse> {
    return unary(
      this.socialGraph.listMutualFollows.bind(this.socialGraph),
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

  /** Readable anonymously (spec §51) — the thread screen works whether or not the viewer is signed in. */
  async getPost(request: GetPostRequest): Promise<GetPostResponse> {
    return unary(this.post.getPost.bind(this.post), request, DEADLINES_MS.unary);
  }

  /** Cursor-paginated, one level deep only — `max_depth` is accepted but not yet honoured
   * server-side (see `apps/server/src/modules/posts/post.controller.ts`). The thread screen
   * gets depth by recursing `ListReplies` per drill-down rather than one deep fetch. */
  async listReplies(request: ListRepliesRequest): Promise<ListRepliesResponse> {
    return unary(this.post.listReplies.bind(this.post), request, DEADLINES_MS.unary);
  }

  async deletePost(request: DeletePostRequest, accessToken: string): Promise<DeletePostResponse> {
    return unary(this.post.deletePost.bind(this.post), request, DEADLINES_MS.unary, accessToken);
  }

  // ---- ReactionService — likes/bookmarks, all require a session (spec §53) ----

  async likePost(request: LikePostRequest, accessToken: string): Promise<LikePostResponse> {
    return unary(
      this.reaction.likePost.bind(this.reaction),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async unlikePost(request: UnlikePostRequest, accessToken: string): Promise<UnlikePostResponse> {
    return unary(
      this.reaction.unlikePost.bind(this.reaction),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async bookmarkPost(
    request: BookmarkPostRequest,
    accessToken: string,
  ): Promise<BookmarkPostResponse> {
    return unary(
      this.reaction.bookmarkPost.bind(this.reaction),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async unbookmarkPost(
    request: UnbookmarkPostRequest,
    accessToken: string,
  ): Promise<UnbookmarkPostResponse> {
    return unary(
      this.reaction.unbookmarkPost.bind(this.reaction),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  /** The caller's own bookmarks — private, never another actor's (spec §53). */
  async listBookmarks(
    request: ListBookmarksRequest,
    accessToken: string,
  ): Promise<ListBookmarksResponse> {
    return unary(
      this.reaction.listBookmarks.bind(this.reaction),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async listPostLikers(request: ListPostLikersRequest): Promise<ListPostLikersResponse> {
    return unary(this.reaction.listPostLikers.bind(this.reaction), request, DEADLINES_MS.unary);
  }

  // ---- NotificationService — requires a session; the TUI polls, no push (spec §56, §113) ----

  async listNotifications(
    request: ListNotificationsRequest,
    accessToken: string,
  ): Promise<ListNotificationsResponse> {
    return unary(
      this.notification.listNotifications.bind(this.notification),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async markNotificationsRead(
    request: MarkNotificationsReadRequest,
    accessToken: string,
  ): Promise<MarkNotificationsReadResponse> {
    return unary(
      this.notification.markNotificationsRead.bind(this.notification),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async getUnreadCount(
    request: GetUnreadCountRequest,
    accessToken: string,
  ): Promise<GetUnreadCountResponse> {
    return unary(
      this.notification.getUnreadCount.bind(this.notification),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  // ---- ModerationService — block/mute/report, all require a session (spec §55, §61–64) ----

  async blockActor(request: BlockActorRequest, accessToken: string): Promise<BlockActorResponse> {
    return unary(
      this.moderation.blockActor.bind(this.moderation),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async unblockActor(
    request: UnblockActorRequest,
    accessToken: string,
  ): Promise<UnblockActorResponse> {
    return unary(
      this.moderation.unblockActor.bind(this.moderation),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async muteActor(request: MuteActorRequest, accessToken: string): Promise<MuteActorResponse> {
    return unary(
      this.moderation.muteActor.bind(this.moderation),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async unmuteActor(
    request: UnmuteActorRequest,
    accessToken: string,
  ): Promise<UnmuteActorResponse> {
    return unary(
      this.moderation.unmuteActor.bind(this.moderation),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async listBlocks(request: ListBlocksRequest, accessToken: string): Promise<ListBlocksResponse> {
    return unary(
      this.moderation.listBlocks.bind(this.moderation),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async listMutes(request: ListMutesRequest, accessToken: string): Promise<ListMutesResponse> {
    return unary(
      this.moderation.listMutes.bind(this.moderation),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async reportPost(request: ReportPostRequest, accessToken: string): Promise<ReportPostResponse> {
    return unary(
      this.moderation.reportPost.bind(this.moderation),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async reportActor(
    request: ReportActorRequest,
    accessToken: string,
  ): Promise<ReportActorResponse> {
    return unary(
      this.moderation.reportActor.bind(this.moderation),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  // ---- MediaService — direct-to-R2 upload (spec §29–32, §54), all require a session ----

  async beginMediaUpload(
    request: BeginMediaUploadRequest,
    accessToken: string,
  ): Promise<BeginMediaUploadResponse> {
    return unary(
      this.media.beginMediaUpload.bind(this.media),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async finalizeMediaUpload(
    request: FinalizeMediaUploadRequest,
    accessToken: string,
  ): Promise<FinalizeMediaUploadResponse> {
    return unary(
      this.media.finalizeMediaUpload.bind(this.media),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async getMediaDownload(
    request: GetMediaDownloadRequest,
    accessToken: string,
  ): Promise<GetMediaDownloadResponse> {
    return unary(
      this.media.getMediaDownload.bind(this.media),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  // ---- PageService — Patches Pages (spec §170–172), block-aware like GetPost/GetActor ----

  /** Anonymous-callable (spec §170) — resolves `handle`/`slug` ("" = index). */
  async getPage(request: GetPageRequest): Promise<GetPageResponse> {
    return unary(this.page.getPage.bind(this.page), request, DEADLINES_MS.unary);
  }

  /** Owner-only whole-document replace, validated strictly server-side (spec §171). */
  async updatePage(request: UpdatePageRequest, accessToken: string): Promise<UpdatePageResponse> {
    return unary(this.page.updatePage.bind(this.page), request, DEADLINES_MS.unary, accessToken);
  }

  /** The caller's own page's revision history — owner only. */
  async listPageRevisions(
    request: ListPageRevisionsRequest,
    accessToken: string,
  ): Promise<ListPageRevisionsResponse> {
    return unary(
      this.page.listPageRevisions.bind(this.page),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async listGuestbook(request: ListGuestbookRequest): Promise<ListGuestbookResponse> {
    return unary(this.page.listGuestbook.bind(this.page), request, DEADLINES_MS.unary);
  }

  /** Requires a session — there is no anonymous guestbook signature (spec §172). */
  async signGuestbook(
    request: SignGuestbookRequest,
    accessToken: string,
  ): Promise<SignGuestbookResponse> {
    return unary(this.page.signGuestbook.bind(this.page), request, DEADLINES_MS.unary, accessToken);
  }

  async removeGuestbookEntry(
    request: RemoveGuestbookEntryRequest,
    accessToken: string,
  ): Promise<RemoveGuestbookEntryResponse> {
    return unary(
      this.page.removeGuestbookEntry.bind(this.page),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async reportGuestbookEntry(
    request: ReportGuestbookEntryRequest,
    accessToken: string,
  ): Promise<ReportGuestbookEntryResponse> {
    return unary(
      this.page.reportGuestbookEntry.bind(this.page),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  close(): void {
    this.system.close();
    this.auth.close();
    this.actor.close();
    this.post.close();
    this.feed.close();
    this.socialGraph.close();
    this.node.close();
    this.reaction.close();
    this.notification.close();
    this.moderation.close();
    this.media.close();
    this.page.close();
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
