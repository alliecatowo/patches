import { randomUUID } from 'node:crypto';

import { credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import {
  createActorClient,
  createAuthClient,
  createCommunityClient,
  createDirectMessageClient,
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
  createTagClient,
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
  type BanFromCommunityRequest,
  type BanFromCommunityResponse,
  type BlockActorRequest,
  type BlockActorResponse,
  type BookmarkPostRequest,
  type BookmarkPostResponse,
  type CompleteSshLoginRequest,
  type CompleteSshLoginResponse,
  type CommunityGrpcClient,
  type CreateCommunityRequest,
  type CreateCommunityResponse,
  type CreateConversationRequest,
  type CreateConversationResponse,
  type CreatePostRequest,
  type CreatePostResponse,
  type DeleteMessageRequest,
  type DeleteMessageResponse,
  type DeletePostRequest,
  type DeletePostResponse,
  type DirectMessageGrpcClient,
  type EditPostRequest,
  type EditPostResponse,
  type FeedGrpcClient,
  type FinalizeMediaUploadRequest,
  type FinalizeMediaUploadResponse,
  type FollowActorRequest,
  type FollowActorResponse,
  type GenerateRecoveryCodesResponse,
  type GetActorByHandleRequest,
  type GetActorByHandleResponse,
  type GetActorRequest,
  type GetActorResponse,
  type GetAuthPolicyResponse,
  type GetCurrentSessionResponse,
  type GetCommunityRequest,
  type GetCommunityResponse,
  type GetConversationRequest,
  type GetConversationResponse,
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
  type InviteToCommunityRequest,
  type InviteToCommunityResponse,
  type JoinCommunityRequest,
  type JoinCommunityResponse,
  type LeaveCommunityRequest,
  type LeaveCommunityResponse,
  type LeaveConversationRequest,
  type LeaveConversationResponse,
  type ListActorPostsRequest,
  type ListActorPostsResponse,
  type ListBlocksRequest,
  type ListBlocksResponse,
  type ListBookmarksRequest,
  type ListBookmarksResponse,
  type ListCommunitiesRequest,
  type ListCommunitiesResponse,
  type ListCommunityFeedRequest,
  type ListCommunityFeedResponse,
  type ListCommunityMembersRequest,
  type ListCommunityMembersResponse,
  type ListConversationsRequest,
  type ListConversationsResponse,
  type ListCredentialsResponse,
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type ListMessageRequestsRequest,
  type ListMessageRequestsResponse,
  type ListMessagesRequest,
  type ListMessagesResponse,
  type ListMutedTagsRequest,
  type ListMutedTagsResponse,
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
  type ListPostEditsRequest,
  type ListPostEditsResponse,
  type ListGuestbookRequest,
  type ListGuestbookResponse,
  type ListRepliesRequest,
  type ListRepliesResponse,
  type ListTagFeedRequest,
  type ListTagFeedResponse,
  type LoginRequest,
  type LoginResponse,
  type RecoveryLoginRequest,
  type RecoveryLoginResponse,
  type LogoutAllSessionsResponse,
  type LogoutRequest,
  type LogoutResponse,
  type MarkConversationReadRequest,
  type MarkConversationReadResponse,
  type MarkNotificationsReadRequest,
  type MarkNotificationsReadResponse,
  type MediaGrpcClient,
  type ModerationGrpcClient,
  type MuteActorRequest,
  type MuteActorResponse,
  type MuteTagRequest,
  type MuteTagResponse,
  type NodeGrpcClient,
  type NotificationGrpcClient,
  type PageGrpcClient,
  type PingResponse,
  type PinPostRequest,
  type PinPostResponse,
  type PostGrpcClient,
  type ReactionGrpcClient,
  type RefreshSessionRequest,
  type RefreshSessionResponse,
  type RegisterRequest,
  type RegisterResponse,
  type RemoveGuestbookEntryRequest,
  type RemoveGuestbookEntryResponse,
  type RemovePostFromCommunityRequest,
  type RemovePostFromCommunityResponse,
  type ReportActorRequest,
  type ReportActorResponse,
  type ReportGuestbookEntryRequest,
  type ReportGuestbookEntryResponse,
  type ReportPostRequest,
  type ReportPostResponse,
  type RepostPostRequest,
  type RepostPostResponse,
  type ResendVerificationResponse,
  type ResolveActorRequest,
  type ResolveActorResponse,
  type RespondToCommunityInviteRequest,
  type RespondToCommunityInviteResponse,
  type RespondToMessageRequestRequest,
  type RespondToMessageRequestResponse,
  type RevokeCredentialRequest,
  type RevokeCredentialResponse,
  type SearchActorsRequest,
  type SearchActorsResponse,
  type SearchPostsRequest,
  type SearchPostsResponse,
  type SearchTagsRequest,
  type SearchTagsResponse,
  type SendMessageRequest,
  type SendMessageResponse,
  type SetCommunityRoleRequest,
  type SetCommunityRoleResponse,
  type SignGuestbookRequest,
  type SignGuestbookResponse,
  type SocialGraphGrpcClient,
  type SystemGrpcClient,
  type TagGrpcClient,
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
  type UnmuteTagRequest,
  type UnmuteTagResponse,
  type UnpinPostRequest,
  type UnpinPostResponse,
  type UnrepostPostRequest,
  type UnrepostPostResponse,
  type UpdateCommunityRequest,
  type UpdateCommunityResponse,
  type UpdatePageRequest,
  type UpdatePageResponse,
  type UpdateProfileRequest,
  type UpdateProfileResponse,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
} from '@patches/proto';
import {
  createAppealClient,
  createFilterClient,
  createFilterListClient,
  createLabelClient,
  createPrivacyClient,
  type AcceptFollowRequestRequest,
  type AcceptFollowRequestResponse,
  type AcknowledgePrivacyNoticeRequest,
  type AcknowledgePrivacyNoticeResponse,
  type AppealGrpcClient,
  type ApplyLabelRequest,
  type ApplyLabelResponse,
  type CancelAccountDeletionRequest,
  type CancelAccountDeletionResponse,
  type CreateAppealRequest,
  type CreateAppealResponse,
  type CreateFilterRequest,
  type CreateFilterResponse,
  type CreateLabelerRequest,
  type CreateLabelerResponse,
  type DeleteFilterListRequest,
  type DeleteFilterListResponse,
  type DeleteFilterRequest,
  type DeleteFilterResponse,
  type ExportAccountRequest,
  type ExportAccountResponse,
  type ExportFiltersResponse,
  type FilterGrpcClient,
  type FilterListGrpcClient,
  type GetAppealRequest,
  type GetAppealResponse,
  type GetDeletionStatusRequest,
  type GetDeletionStatusResponse,
  type GetExportStatusRequest,
  type GetExportStatusResponse,
  type GetFilterListRequest,
  type GetFilterListResponse,
  type GetLabelerRequest,
  type GetLabelerResponse,
  type GetNodePolicyResponse,
  type GetPrivacyPrefsRequest,
  type GetPrivacyPrefsResponse,
  type ImportFiltersRequest,
  type ImportFiltersResponse,
  type LabelGrpcClient,
  type ListFollowRequestsRequest,
  type ListFollowRequestsResponse,
  type ListFilterListEntriesRequest,
  type ListFilterListEntriesResponse,
  type ListFilterListsRequest,
  type ListFilterListsResponse,
  type ListFilterListSubscriptionsRequest,
  type ListFilterListSubscriptionsResponse,
  type ListFiltersRequest,
  type ListFiltersResponse,
  type ListLabelersRequest,
  type ListLabelersResponse,
  type ListLabelsOnSubjectRequest,
  type ListLabelsOnSubjectResponse,
  type ListModerationLogRequest,
  type ListModerationLogResponse,
  type ListMyAppealsRequest,
  type ListMyAppealsResponse,
  type ListMyModerationNoticesRequest,
  type ListMyModerationNoticesResponse,
  type PrivacyGrpcClient,
  type PublishFilterListRequest,
  type PublishFilterListResponse,
  type RejectFollowRequestRequest,
  type RejectFollowRequestResponse,
  type RequestAccountDeletionRequest,
  type RequestAccountDeletionResponse,
  type RetractLabelRequest,
  type RetractLabelResponse,
  type SetFilterListEntryExceptionRequest,
  type SetFilterListEntryExceptionResponse,
  type SetLabelerSubscriptionActionRequest,
  type SetLabelerSubscriptionActionResponse,
  type SubscribeFilterListRequest,
  type SubscribeFilterListResponse,
  type SubscribeLabelerRequest,
  type SubscribeLabelerResponse,
  type UnsubscribeFilterListRequest,
  type UnsubscribeFilterListResponse,
  type UnsubscribeLabelerRequest,
  type UnsubscribeLabelerResponse,
  type UpdateFilterListRequest,
  type UpdateFilterListResponse,
  type UpdateFilterRequest,
  type UpdateFilterResponse,
  type UpdatePrivacyPrefsRequest,
  type UpdatePrivacyPrefsResponse,
} from '@patches/proto';

import { CLIENT_NAME, TUI_VERSION } from '../version.js';
import { getAmbientAccessToken } from './ambient-token.js';

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
  private readonly community: CommunityGrpcClient;
  private readonly directMessage: DirectMessageGrpcClient;
  private readonly tag: TagGrpcClient;
  private readonly filter: FilterGrpcClient;
  private readonly filterList: FilterListGrpcClient;
  private readonly label: LabelGrpcClient;
  private readonly appeal: AppealGrpcClient;
  private readonly privacy: PrivacyGrpcClient;

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
    this.community = createCommunityClient(options.target, channelCredentials);
    this.directMessage = createDirectMessageClient(options.target, channelCredentials);
    this.tag = createTagClient(options.target, channelCredentials);
    this.filter = createFilterClient(options.target, channelCredentials);
    this.filterList = createFilterListClient(options.target, channelCredentials);
    this.label = createLabelClient(options.target, channelCredentials);
    this.appeal = createAppealClient(options.target, channelCredentials);
    this.privacy = createPrivacyClient(options.target, channelCredentials);
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

  /** Always unauthenticated, always cheap (P15-002) — call before rendering password UI. */
  async getAuthPolicy(): Promise<GetAuthPolicyResponse> {
    return unary(this.auth.getAuthPolicy.bind(this.auth), {}, DEADLINES_MS.auth);
  }

  /** Redeems a single-use recovery code for a session (P15-003), the unauthenticated
   * counterpart to `login()`. */
  async recoveryLogin(request: RecoveryLoginRequest): Promise<RecoveryLoginResponse> {
    return unary(this.auth.recoveryLogin.bind(this.auth), request, DEADLINES_MS.auth);
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

  /** Mints a fresh set of 10 recovery codes, invalidating any generated previously
   * (P15-003). */
  async generateRecoveryCodes(accessToken: string): Promise<GenerateRecoveryCodesResponse> {
    return unary(
      this.auth.generateRecoveryCodes.bind(this.auth),
      {},
      DEADLINES_MS.auth,
      accessToken,
    );
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

  /** Anonymous-readable, but the token is passed whenever there is a session: without
   * it the server has no viewer to compute `viewer_state` for, and every post comes
   * back un-liked/un-bookmarked (owner report 2026-08-18 — the server was right, the
   * client simply wasn't identifying itself on these reads). */
  async listActorPosts(
    request: ListActorPostsRequest,
    accessToken?: string,
  ): Promise<ListActorPostsResponse> {
    return unary(
      this.feed.listActorPosts.bind(this.feed),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  /** Anonymous-readable; pass the token when signed in so `viewer_state` is populated. */
  async listLocalFeed(
    request: ListLocalFeedRequest,
    accessToken?: string,
  ): Promise<ListLocalFeedResponse> {
    return unary(this.feed.listLocalFeed.bind(this.feed), request, DEADLINES_MS.unary, accessToken);
  }

  async listTagFeed(
    request: ListTagFeedRequest,
    accessToken?: string,
  ): Promise<ListTagFeedResponse> {
    return unary(this.feed.listTagFeed.bind(this.feed), request, DEADLINES_MS.unary, accessToken);
  }

  async listCommunityFeed(
    request: ListCommunityFeedRequest,
    accessToken?: string,
  ): Promise<ListCommunityFeedResponse> {
    return unary(
      this.feed.listCommunityFeed.bind(this.feed),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
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

  /** Pending follow requests addressed to the caller's own locked account (spec §197.5),
   * newest first. */
  async listFollowRequests(
    request: ListFollowRequestsRequest,
    accessToken: string,
  ): Promise<ListFollowRequestsResponse> {
    return unary(
      this.socialGraph.listFollowRequests.bind(this.socialGraph),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async acceptFollowRequest(
    request: AcceptFollowRequestRequest,
    accessToken: string,
  ): Promise<AcceptFollowRequestResponse> {
    return unary(
      this.socialGraph.acceptFollowRequest.bind(this.socialGraph),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async rejectFollowRequest(
    request: RejectFollowRequestRequest,
    accessToken: string,
  ): Promise<RejectFollowRequestResponse> {
    return unary(
      this.socialGraph.rejectFollowRequest.bind(this.socialGraph),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  // ---- NodeService — unauthenticated node discovery (spec §174) ----

  async getNodeInfo(): Promise<GetNodeInfoResponse> {
    return unary(this.node.getNodeInfo.bind(this.node), {}, DEADLINES_MS.unary);
  }

  /** Operator transparency document (spec §197.6) — unauthenticated, like `getNodeInfo`.
   * An all-empty `NodePolicy` means "this node publishes no policy"; render that
   * explicitly rather than hiding the screen. */
  async getNodePolicy(): Promise<GetNodePolicyResponse> {
    return unary(this.node.getNodePolicy.bind(this.node), {}, DEADLINES_MS.unary);
  }

  // ---- PostService — requires an authenticated session ----

  async createPost(request: CreatePostRequest, accessToken: string): Promise<CreatePostResponse> {
    return unary(this.post.createPost.bind(this.post), request, DEADLINES_MS.unary, accessToken);
  }

  /** Readable anonymously (spec §51) — the thread screen works whether or not the viewer
   * is signed in; the token, when there is one, is what fills in `viewer_state`. */
  async getPost(request: GetPostRequest, accessToken?: string): Promise<GetPostResponse> {
    return unary(this.post.getPost.bind(this.post), request, DEADLINES_MS.unary, accessToken);
  }

  /** Full-text post search (newest-first keyset, never relevance-by-engagement — §194).
   * Anonymous-readable; the token fills in `viewer_state` for the results. */
  async searchPosts(
    request: SearchPostsRequest,
    accessToken?: string,
  ): Promise<SearchPostsResponse> {
    return unary(this.post.searchPosts.bind(this.post), request, DEADLINES_MS.unary, accessToken);
  }

  /** Cursor-paginated, one level deep only — `max_depth` is accepted but not yet honoured
   * server-side (see `apps/server/src/modules/posts/post.controller.ts`). The thread screen
   * gets depth by recursing `ListReplies` per drill-down rather than one deep fetch. */
  async listReplies(
    request: ListRepliesRequest,
    accessToken?: string,
  ): Promise<ListRepliesResponse> {
    return unary(this.post.listReplies.bind(this.post), request, DEADLINES_MS.unary, accessToken);
  }

  async deletePost(request: DeletePostRequest, accessToken: string): Promise<DeletePostResponse> {
    return unary(this.post.deletePost.bind(this.post), request, DEADLINES_MS.unary, accessToken);
  }

  async editPost(request: EditPostRequest, accessToken: string): Promise<EditPostResponse> {
    return unary(this.post.editPost.bind(this.post), request, DEADLINES_MS.unary, accessToken);
  }

  async listPostEdits(
    request: ListPostEditsRequest,
    accessToken?: string,
  ): Promise<ListPostEditsResponse> {
    return unary(this.post.listPostEdits.bind(this.post), request, DEADLINES_MS.unary, accessToken);
  }

  async pinPost(request: PinPostRequest, accessToken: string): Promise<PinPostResponse> {
    return unary(this.post.pinPost.bind(this.post), request, DEADLINES_MS.unary, accessToken);
  }

  async unpinPost(request: UnpinPostRequest, accessToken: string): Promise<UnpinPostResponse> {
    return unary(this.post.unpinPost.bind(this.post), request, DEADLINES_MS.unary, accessToken);
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

  async repostPost(request: RepostPostRequest, accessToken: string): Promise<RepostPostResponse> {
    return unary(
      this.reaction.repostPost.bind(this.reaction),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async unrepostPost(
    request: UnrepostPostRequest,
    accessToken: string,
  ): Promise<UnrepostPostResponse> {
    return unary(
      this.reaction.unrepostPost.bind(this.reaction),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
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

  /** A public, anonymized transparency record (spec §201.4) — unauthenticated. */
  async listModerationLog(request: ListModerationLogRequest): Promise<ListModerationLogResponse> {
    return unary(
      this.moderation.listModerationLog.bind(this.moderation),
      request,
      DEADLINES_MS.unary,
    );
  }

  /** The caller's own notified enforcement actions (spec §201.2) — never a report's
   * internal moderator note. */
  async listMyModerationNotices(
    request: ListMyModerationNoticesRequest,
    accessToken: string,
  ): Promise<ListMyModerationNoticesResponse> {
    return unary(
      this.moderation.listMyModerationNotices.bind(this.moderation),
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

  // ---- CommunityService — public discovery; membership and moderation require a session ----

  async createCommunity(
    request: CreateCommunityRequest,
    accessToken: string,
  ): Promise<CreateCommunityResponse> {
    return unary(
      this.community.createCommunity.bind(this.community),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async getCommunity(
    request: GetCommunityRequest,
    accessToken?: string,
  ): Promise<GetCommunityResponse> {
    return unary(
      this.community.getCommunity.bind(this.community),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async listCommunities(
    request: ListCommunitiesRequest,
    accessToken?: string,
  ): Promise<ListCommunitiesResponse> {
    return unary(
      this.community.listCommunities.bind(this.community),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async joinCommunity(
    request: JoinCommunityRequest,
    accessToken: string,
  ): Promise<JoinCommunityResponse> {
    return unary(
      this.community.joinCommunity.bind(this.community),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async leaveCommunity(
    request: LeaveCommunityRequest,
    accessToken: string,
  ): Promise<LeaveCommunityResponse> {
    return unary(
      this.community.leaveCommunity.bind(this.community),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async listCommunityMembers(
    request: ListCommunityMembersRequest,
    accessToken: string,
  ): Promise<ListCommunityMembersResponse> {
    return unary(
      this.community.listCommunityMembers.bind(this.community),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async updateCommunity(
    request: UpdateCommunityRequest,
    accessToken: string,
  ): Promise<UpdateCommunityResponse> {
    return unary(
      this.community.updateCommunity.bind(this.community),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async setCommunityRole(
    request: SetCommunityRoleRequest,
    accessToken: string,
  ): Promise<SetCommunityRoleResponse> {
    return unary(
      this.community.setCommunityRole.bind(this.community),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async removePostFromCommunity(
    request: RemovePostFromCommunityRequest,
    accessToken: string,
  ): Promise<RemovePostFromCommunityResponse> {
    return unary(
      this.community.removePostFromCommunity.bind(this.community),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async banFromCommunity(
    request: BanFromCommunityRequest,
    accessToken: string,
  ): Promise<BanFromCommunityResponse> {
    return unary(
      this.community.banFromCommunity.bind(this.community),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async inviteToCommunity(
    request: InviteToCommunityRequest,
    accessToken: string,
  ): Promise<InviteToCommunityResponse> {
    return unary(
      this.community.inviteToCommunity.bind(this.community),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async respondToCommunityInvite(
    request: RespondToCommunityInviteRequest,
    accessToken: string,
  ): Promise<RespondToCommunityInviteResponse> {
    return unary(
      this.community.respondToCommunityInvite.bind(this.community),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  // ---- DirectMessageService — all calls require a session (spec §183) ----

  async listConversations(
    request: ListConversationsRequest,
    accessToken: string,
  ): Promise<ListConversationsResponse> {
    return unary(
      this.directMessage.listConversations.bind(this.directMessage),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async getConversation(
    request: GetConversationRequest,
    accessToken: string,
  ): Promise<GetConversationResponse> {
    return unary(
      this.directMessage.getConversation.bind(this.directMessage),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async listMessages(
    request: ListMessagesRequest,
    accessToken: string,
  ): Promise<ListMessagesResponse> {
    return unary(
      this.directMessage.listMessages.bind(this.directMessage),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async sendMessage(
    request: SendMessageRequest,
    accessToken: string,
  ): Promise<SendMessageResponse> {
    return unary(
      this.directMessage.sendMessage.bind(this.directMessage),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async deleteMessage(
    request: DeleteMessageRequest,
    accessToken: string,
  ): Promise<DeleteMessageResponse> {
    return unary(
      this.directMessage.deleteMessage.bind(this.directMessage),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async createConversation(
    request: CreateConversationRequest,
    accessToken: string,
  ): Promise<CreateConversationResponse> {
    return unary(
      this.directMessage.createConversation.bind(this.directMessage),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async leaveConversation(
    request: LeaveConversationRequest,
    accessToken: string,
  ): Promise<LeaveConversationResponse> {
    return unary(
      this.directMessage.leaveConversation.bind(this.directMessage),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async markConversationRead(
    request: MarkConversationReadRequest,
    accessToken: string,
  ): Promise<MarkConversationReadResponse> {
    return unary(
      this.directMessage.markConversationRead.bind(this.directMessage),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async listMessageRequests(
    request: ListMessageRequestsRequest,
    accessToken: string,
  ): Promise<ListMessageRequestsResponse> {
    return unary(
      this.directMessage.listMessageRequests.bind(this.directMessage),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async respondToMessageRequest(
    request: RespondToMessageRequestRequest,
    accessToken: string,
  ): Promise<RespondToMessageRequestResponse> {
    return unary(
      this.directMessage.respondToMessageRequest.bind(this.directMessage),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  // ---- TagService — public search; mute state requires a session ----

  async searchTags(request: SearchTagsRequest, accessToken?: string): Promise<SearchTagsResponse> {
    return unary(this.tag.searchTags.bind(this.tag), request, DEADLINES_MS.unary, accessToken);
  }

  async muteTag(request: MuteTagRequest, accessToken: string): Promise<MuteTagResponse> {
    return unary(this.tag.muteTag.bind(this.tag), request, DEADLINES_MS.unary, accessToken);
  }

  async unmuteTag(request: UnmuteTagRequest, accessToken: string): Promise<UnmuteTagResponse> {
    return unary(this.tag.unmuteTag.bind(this.tag), request, DEADLINES_MS.unary, accessToken);
  }

  async listMutedTags(
    request: ListMutedTagsRequest,
    accessToken: string,
  ): Promise<ListMutedTagsResponse> {
    return unary(this.tag.listMutedTags.bind(this.tag), request, DEADLINES_MS.unary, accessToken);
  }

  // ---- FilterService — bring-your-own filters (spec §198), all require a session ----

  async createFilter(
    request: CreateFilterRequest,
    accessToken: string,
  ): Promise<CreateFilterResponse> {
    return unary(
      this.filter.createFilter.bind(this.filter),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async updateFilter(
    request: UpdateFilterRequest,
    accessToken: string,
  ): Promise<UpdateFilterResponse> {
    return unary(
      this.filter.updateFilter.bind(this.filter),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async deleteFilter(
    request: DeleteFilterRequest,
    accessToken: string,
  ): Promise<DeleteFilterResponse> {
    return unary(
      this.filter.deleteFilter.bind(this.filter),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async listFilters(
    request: ListFiltersRequest,
    accessToken: string,
  ): Promise<ListFiltersResponse> {
    return unary(
      this.filter.listFilters.bind(this.filter),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async exportFilters(accessToken: string): Promise<ExportFiltersResponse> {
    return unary(this.filter.exportFilters.bind(this.filter), {}, DEADLINES_MS.unary, accessToken);
  }

  /** `apply: false` (the default) previews what would be added without writing
   * anything (spec §198.5) — the client always renders that preview before a second
   * call with `apply: true` actually commits it. */
  async importFilters(
    request: ImportFiltersRequest,
    accessToken: string,
  ): Promise<ImportFiltersResponse> {
    return unary(
      this.filter.importFilters.bind(this.filter),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  // ---- FilterListService — publishable/subscribable filter lists (spec §199) ----

  async publishFilterList(
    request: PublishFilterListRequest,
    accessToken: string,
  ): Promise<PublishFilterListResponse> {
    return unary(
      this.filterList.publishFilterList.bind(this.filterList),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async updateFilterList(
    request: UpdateFilterListRequest,
    accessToken: string,
  ): Promise<UpdateFilterListResponse> {
    return unary(
      this.filterList.updateFilterList.bind(this.filterList),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async deleteFilterList(
    request: DeleteFilterListRequest,
    accessToken: string,
  ): Promise<DeleteFilterListResponse> {
    return unary(
      this.filterList.deleteFilterList.bind(this.filterList),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  /** Anonymous-readable — a published list is public by construction (spec §199.1). */
  async getFilterList(
    request: GetFilterListRequest,
    accessToken?: string,
  ): Promise<GetFilterListResponse> {
    return unary(
      this.filterList.getFilterList.bind(this.filterList),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async listFilterLists(
    request: ListFilterListsRequest,
    accessToken?: string,
  ): Promise<ListFilterListsResponse> {
    return unary(
      this.filterList.listFilterLists.bind(this.filterList),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  /** The full entry set — visible to any subscriber, never a black box (spec §199.3). */
  async listFilterListEntries(
    request: ListFilterListEntriesRequest,
    accessToken?: string,
  ): Promise<ListFilterListEntriesResponse> {
    return unary(
      this.filterList.listFilterListEntries.bind(this.filterList),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async subscribeFilterList(
    request: SubscribeFilterListRequest,
    accessToken: string,
  ): Promise<SubscribeFilterListResponse> {
    return unary(
      this.filterList.subscribeFilterList.bind(this.filterList),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async unsubscribeFilterList(
    request: UnsubscribeFilterListRequest,
    accessToken: string,
  ): Promise<UnsubscribeFilterListResponse> {
    return unary(
      this.filterList.unsubscribeFilterList.bind(this.filterList),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async listFilterListSubscriptions(
    request: ListFilterListSubscriptionsRequest,
    accessToken: string,
  ): Promise<ListFilterListSubscriptionsResponse> {
    return unary(
      this.filterList.listFilterListSubscriptions.bind(this.filterList),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  /** "This list is right about everything except my friend" (spec §199.3) — never
   * unsubscribes, never tells the list author. */
  async setFilterListEntryException(
    request: SetFilterListEntryExceptionRequest,
    accessToken: string,
  ): Promise<SetFilterListEntryExceptionResponse> {
    return unary(
      this.filterList.setFilterListEntryException.bind(this.filterList),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  // ---- LabelService — subscriber-scoped annotation (spec §200) ----

  async createLabeler(
    request: CreateLabelerRequest,
    accessToken: string,
  ): Promise<CreateLabelerResponse> {
    return unary(
      this.label.createLabeler.bind(this.label),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async getLabeler(request: GetLabelerRequest, accessToken?: string): Promise<GetLabelerResponse> {
    return unary(this.label.getLabeler.bind(this.label), request, DEADLINES_MS.unary, accessToken);
  }

  async listLabelers(
    request: ListLabelersRequest,
    accessToken?: string,
  ): Promise<ListLabelersResponse> {
    return unary(
      this.label.listLabelers.bind(this.label),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async applyLabel(request: ApplyLabelRequest, accessToken: string): Promise<ApplyLabelResponse> {
    return unary(this.label.applyLabel.bind(this.label), request, DEADLINES_MS.unary, accessToken);
  }

  async retractLabel(
    request: RetractLabelRequest,
    accessToken: string,
  ): Promise<RetractLabelResponse> {
    return unary(
      this.label.retractLabel.bind(this.label),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async subscribeLabeler(
    request: SubscribeLabelerRequest,
    accessToken: string,
  ): Promise<SubscribeLabelerResponse> {
    return unary(
      this.label.subscribeLabeler.bind(this.label),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async unsubscribeLabeler(
    request: UnsubscribeLabelerRequest,
    accessToken: string,
  ): Promise<UnsubscribeLabelerResponse> {
    return unary(
      this.label.unsubscribeLabeler.bind(this.label),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  /** A viewer may set any value to `LABEL_ACTION_IGNORE` except a value the node has
   * designated legally mandatory (`LabelVocabularyEntry.mandatory`, spec §200.3) —
   * enforced server-side. */
  async setLabelerSubscriptionAction(
    request: SetLabelerSubscriptionActionRequest,
    accessToken: string,
  ): Promise<SetLabelerSubscriptionActionResponse> {
    return unary(
      this.label.setLabelerSubscriptionAction.bind(this.label),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  /** Pull-only self-inspection (spec §200.4) — an actor is never notified that they
   * were labeled. */
  async listLabelsOnSubject(
    request: ListLabelsOnSubjectRequest,
    accessToken?: string,
  ): Promise<ListLabelsOnSubjectResponse> {
    return unary(
      this.label.listLabelsOnSubject.bind(this.label),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  // ---- AppealService — appeals against a node moderation notice (spec §201.3) ----

  async createAppeal(
    request: CreateAppealRequest,
    accessToken: string,
  ): Promise<CreateAppealResponse> {
    return unary(
      this.appeal.createAppeal.bind(this.appeal),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async getAppeal(request: GetAppealRequest, accessToken: string): Promise<GetAppealResponse> {
    return unary(this.appeal.getAppeal.bind(this.appeal), request, DEADLINES_MS.unary, accessToken);
  }

  async listMyAppeals(
    request: ListMyAppealsRequest,
    accessToken: string,
  ): Promise<ListMyAppealsResponse> {
    return unary(
      this.appeal.listMyAppeals.bind(this.appeal),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  // ---- PrivacyService — notice, discoverability, export, deletion (spec §197) ----

  async acknowledgePrivacyNotice(
    request: AcknowledgePrivacyNoticeRequest,
    accessToken: string,
  ): Promise<AcknowledgePrivacyNoticeResponse> {
    return unary(
      this.privacy.acknowledgePrivacyNotice.bind(this.privacy),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async getPrivacyPrefs(
    request: GetPrivacyPrefsRequest,
    accessToken: string,
  ): Promise<GetPrivacyPrefsResponse> {
    return unary(
      this.privacy.getPrivacyPrefs.bind(this.privacy),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async updatePrivacyPrefs(
    request: UpdatePrivacyPrefsRequest,
    accessToken: string,
  ): Promise<UpdatePrivacyPrefsResponse> {
    return unary(
      this.privacy.updatePrivacyPrefs.bind(this.privacy),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  /** Enqueues a background export job — never synchronous (spec §30, ADR 0004). */
  async exportAccount(
    request: ExportAccountRequest,
    accessToken: string,
  ): Promise<ExportAccountResponse> {
    return unary(
      this.privacy.exportAccount.bind(this.privacy),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async getExportStatus(
    request: GetExportStatusRequest,
    accessToken: string,
  ): Promise<GetExportStatusResponse> {
    return unary(
      this.privacy.getExportStatus.bind(this.privacy),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  /** Moves the account to `PENDING_DELETION` immediately, then a grace period
   * (spec §197.4). */
  async requestAccountDeletion(
    request: RequestAccountDeletionRequest,
    accessToken: string,
  ): Promise<RequestAccountDeletionResponse> {
    return unary(
      this.privacy.requestAccountDeletion.bind(this.privacy),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  /** Only while still within the grace period. */
  async cancelAccountDeletion(
    request: CancelAccountDeletionRequest,
    accessToken: string,
  ): Promise<CancelAccountDeletionResponse> {
    return unary(
      this.privacy.cancelAccountDeletion.bind(this.privacy),
      request,
      DEADLINES_MS.unary,
      accessToken,
    );
  }

  async getDeletionStatus(
    request: GetDeletionStatusRequest,
    accessToken: string,
  ): Promise<GetDeletionStatusResponse> {
    return unary(
      this.privacy.getDeletionStatus.bind(this.privacy),
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
    this.community.close();
    this.directMessage.close();
    this.tag.close();
    this.filter.close();
    this.filterList.close();
    this.label.close();
    this.appeal.close();
    this.privacy.close();
  }
}

/** Per-call metadata required on every RPC (spec §44). */
function callMetadata(accessToken?: string): Metadata {
  const metadata = new Metadata();
  metadata.set(METADATA_KEYS.requestId, randomUUID());
  metadata.set(METADATA_KEYS.client, CLIENT_NAME);
  metadata.set(METADATA_KEYS.clientVersion, TUI_VERSION);
  // B-040: fall back to the signed-in session's token so reads that were written as
  // anonymous-legal still carry auth on a node with `PUBLIC_READ=false`. An explicit
  // per-call token wins; signed out, neither exists and no header is sent.
  const token = accessToken ?? getAmbientAccessToken();
  if (token !== undefined) {
    metadata.set(METADATA_KEYS.authorization, `Bearer ${token}`);
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
