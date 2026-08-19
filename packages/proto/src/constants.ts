import type { CallOptions, Client, ClientUnaryCall, Metadata, ServiceError } from '@grpc/grpc-js';
import type { Options as ProtoLoaderOptions } from '@grpc/proto-loader';

import type {
  GetActorByHandleRequest,
  GetActorByHandleResponse,
  GetActorRequest,
  GetActorResponse,
  ListFollowersRequest,
  ListFollowersResponse,
  ListFollowingRequest,
  ListFollowingResponse,
  ResolveActorRequest,
  ResolveActorResponse,
  SearchActorsRequest,
  SearchActorsResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from './generated/patches/v1/actors.js';
import type {
  AddCredentialRequest,
  AddCredentialResponse,
  BeginGitHubLoginRequest,
  BeginGitHubLoginResponse,
  BeginSshEnrollmentRequest,
  BeginSshEnrollmentResponse,
  BeginSshLoginRequest,
  BeginSshLoginResponse,
  CompleteSshLoginRequest,
  CompleteSshLoginResponse,
  GetCurrentSessionRequest,
  GetCurrentSessionResponse,
  ListCredentialsRequest,
  ListCredentialsResponse,
  LoginRequest,
  LoginResponse,
  LogoutAllSessionsRequest,
  LogoutAllSessionsResponse,
  LogoutRequest,
  LogoutResponse,
  PollGitHubLoginRequest,
  PollGitHubLoginResponse,
  RefreshSessionRequest,
  RefreshSessionResponse,
  RegisterRequest,
  RegisterResponse,
  RequestPasswordResetRequest,
  RequestPasswordResetResponse,
  ResendVerificationRequest,
  ResendVerificationResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  RevokeCredentialRequest,
  RevokeCredentialResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from './generated/patches/v1/auth.js';
import type {
  ListCommunityFeedRequest,
  ListCommunityFeedResponse,
  ListHomeFeedRequest,
  ListHomeFeedResponse,
  ListLocalFeedRequest,
  ListLocalFeedResponse,
  ListActorPostsRequest,
  ListActorPostsResponse,
  ListTagFeedRequest,
  ListTagFeedResponse,
} from './generated/patches/v1/feeds.js';
import type {
  BeginMediaUploadRequest,
  BeginMediaUploadResponse,
  FinalizeMediaUploadRequest,
  FinalizeMediaUploadResponse,
  GetMediaDownloadRequest,
  GetMediaDownloadResponse,
} from './generated/patches/v1/media.js';
import type {
  BanFromCommunityRequest,
  BanFromCommunityResponse,
  CreateCommunityRequest,
  CreateCommunityResponse,
  GetCommunityRequest,
  GetCommunityResponse,
  InviteToCommunityRequest,
  InviteToCommunityResponse,
  JoinCommunityRequest,
  JoinCommunityResponse,
  LeaveCommunityRequest,
  LeaveCommunityResponse,
  ListCommunitiesRequest,
  ListCommunitiesResponse,
  ListCommunityMembersRequest,
  ListCommunityMembersResponse,
  RemovePostFromCommunityRequest,
  RemovePostFromCommunityResponse,
  RespondToCommunityInviteRequest,
  RespondToCommunityInviteResponse,
  SetCommunityRoleRequest,
  SetCommunityRoleResponse,
  UpdateCommunityRequest,
  UpdateCommunityResponse,
} from './generated/patches/v1/communities.js';
import type {
  CreateConversationRequest,
  CreateConversationResponse,
  DeleteMessageRequest,
  DeleteMessageResponse,
  GetConversationRequest,
  GetConversationResponse,
  LeaveConversationRequest,
  LeaveConversationResponse,
  ListConversationsRequest,
  ListConversationsResponse,
  ListMessageRequestsRequest,
  ListMessageRequestsResponse,
  ListMessagesRequest,
  ListMessagesResponse,
  MarkConversationReadRequest,
  MarkConversationReadResponse,
  RespondToMessageRequestRequest,
  RespondToMessageRequestResponse,
  SendMessageRequest,
  SendMessageResponse,
} from './generated/patches/v1/messages.js';
import type {
  BlockActorRequest,
  BlockActorResponse,
  ListBlocksRequest,
  ListBlocksResponse,
  ListMutesRequest,
  ListMutesResponse,
  MuteActorRequest,
  MuteActorResponse,
  ReportActorRequest,
  ReportActorResponse,
  ReportMessageRequest,
  ReportMessageResponse,
  ReportPostRequest,
  ReportPostResponse,
  UnblockActorRequest,
  UnblockActorResponse,
  UnmuteActorRequest,
  UnmuteActorResponse,
} from './generated/patches/v1/moderation.js';
import type { GetNodeInfoRequest, GetNodeInfoResponse } from './generated/patches/v1/node.js';
import type {
  GetUnreadCountRequest,
  GetUnreadCountResponse,
  ListNotificationsRequest,
  ListNotificationsResponse,
  MarkNotificationsReadRequest,
  MarkNotificationsReadResponse,
} from './generated/patches/v1/notifications.js';
import type {
  GetPageRequest,
  GetPageResponse,
  ListGuestbookRequest,
  ListGuestbookResponse,
  ListPageRevisionsRequest,
  ListPageRevisionsResponse,
  RemoveGuestbookEntryRequest,
  RemoveGuestbookEntryResponse,
  ReportGuestbookEntryRequest,
  ReportGuestbookEntryResponse,
  SignGuestbookRequest,
  SignGuestbookResponse,
  UpdatePageRequest,
  UpdatePageResponse,
} from './generated/patches/v1/pages.js';
import type {
  CreatePostRequest,
  CreatePostResponse,
  DeletePostRequest,
  DeletePostResponse,
  EditPostRequest,
  EditPostResponse,
  GetPostRequest,
  GetPostResponse,
  ListPostEditsRequest,
  ListPostEditsResponse,
  ListRepliesRequest,
  ListRepliesResponse,
  PinPostRequest,
  PinPostResponse,
  SearchPostsRequest,
  SearchPostsResponse,
  UnpinPostRequest,
  UnpinPostResponse,
} from './generated/patches/v1/posts.js';
import type {
  BookmarkPostRequest,
  BookmarkPostResponse,
  ListBookmarksRequest,
  ListBookmarksResponse,
  ListPostLikersRequest,
  ListPostLikersResponse,
  ListPostRepostersRequest,
  ListPostRepostersResponse,
  LikePostRequest,
  LikePostResponse,
  RepostPostRequest,
  RepostPostResponse,
  UnbookmarkPostRequest,
  UnbookmarkPostResponse,
  UnlikePostRequest,
  UnlikePostResponse,
  UnrepostPostRequest,
  UnrepostPostResponse,
} from './generated/patches/v1/reactions.js';
import type {
  FollowActorRequest,
  FollowActorResponse,
  GetRelationshipRequest,
  GetRelationshipResponse,
  ListMutualFollowsRequest,
  ListMutualFollowsResponse,
  UnfollowActorRequest,
  UnfollowActorResponse,
} from './generated/patches/v1/social_graph.js';
import type {
  GetServerInfoRequest,
  GetServerInfoResponse,
  PingRequest,
  PingResponse,
} from './generated/patches/v1/system.js';
import type {
  ListMutedTagsRequest,
  ListMutedTagsResponse,
  MuteTagRequest,
  MuteTagResponse,
  SearchTagsRequest,
  SearchTagsResponse,
  UnmuteTagRequest,
  UnmuteTagResponse,
} from './generated/patches/v1/tags.js';
import { getProtoDir } from './proto-path.js';

/**
 * Wire protocol version spoken by this schema (spec §83).
 *
 * Bumped only when the *meaning* of an existing protobuf field changes in a way
 * `buf breaking` cannot detect. Adding fields/messages/RPCs does not bump it.
 */
export const PROTOCOL_VERSION = 1;

/**
 * Oldest client build the server will serve. Clients that report an older
 * version are rejected with `FAILED_PRECONDITION` and an actionable message.
 */
export const MIN_CLIENT_VERSION = '0.1.0';

/** Protobuf package namespace. Matches the `package` in every `.proto`. */
export const PATCHES_PACKAGE_NAME = 'patches.v1';

/** Protobuf packages the gRPC server must load. */
export const GRPC_PACKAGES: readonly string[] = Object.freeze([PATCHES_PACKAGE_NAME]);

/** Service names, as they appear in the `.proto` (used by `@GrpcMethod`). */
export const SERVICE_NAMES = Object.freeze({
  system: 'SystemService',
  auth: 'AuthService',
  actor: 'ActorService',
  post: 'PostService',
  feed: 'FeedService',
  socialGraph: 'SocialGraphService',
  node: 'NodeService',
  reaction: 'ReactionService',
  notification: 'NotificationService',
  moderation: 'ModerationService',
  media: 'MediaService',
  page: 'PageService',
  community: 'CommunityService',
  directMessage: 'DirectMessageService',
  tag: 'TagService',
} as const);

/** gRPC metadata keys used across every call (spec §44). */
export const METADATA_KEYS = Object.freeze({
  /** `Bearer <access-token>`. Never logged. */
  authorization: 'authorization',
  /** Correlation ID propagated into server logs. */
  requestId: 'x-request-id',
  /** Client type, e.g. `tui`. */
  client: 'x-patches-client',
  /** Client build version, semver. */
  clientVersion: 'x-patches-client-version',
} as const);

/** Response metadata key carrying the application error code (spec §57). */
export const ERROR_CODE_METADATA_KEY = 'x-patches-error-code';

/** Default call deadlines in milliseconds (spec §44). Every call must have one. */
export const DEADLINES_MS = Object.freeze({
  unary: 10_000,
  uploadInit: 10_000,
  auth: 15_000,
} as const);

/**
 * proto-loader options. **Both ends must use these exact values**: server and
 * client parse the `.proto` independently at runtime, so a mismatch in
 * `longs`/`enums`/`keepCase` silently changes the JS types on one side only
 * (see docs/research/nestjs-grpc-protobuf.md §6).
 *
 * `longs: String` is what makes the generated `Timestamp.seconds` type
 * (`forceLong=string`) accurate.
 */
export const PROTO_LOADER_OPTIONS: ProtoLoaderOptions = Object.freeze({
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  // A getter, not a data property (A-010): `Object.freeze` only locks the property
  // descriptor, not the getter's return value, so this still defers the `getProtoDir()`
  // directory check to the first time something actually reads `includeDirs` (i.e. when
  // `@grpc/proto-loader` loads the schema) instead of at this module's import time.
  get includeDirs() {
    return [getProtoDir()];
  },
});

/**
 * A unary method on a `@grpc/grpc-js` client built by `loadPackageDefinition`.
 *
 * The generated `SystemServiceClient` interface is **not** usable for this: it
 * describes Nest's `ClientGrpc` proxy (RxJS `Observable` returns), not a raw
 * grpc-js client (Node callbacks). Casting a grpc-js client to it — as the
 * research note suggests — type-checks but lies about the runtime shape, so the
 * callback signature is spelled out here instead and reused by every client.
 */
export type GrpcUnaryCall<Request, Response> = (
  request: Request,
  metadata: Metadata,
  options: CallOptions,
  callback: (error: ServiceError | null, response?: Response) => void,
) => ClientUnaryCall;

/** `patches.v1.SystemService` as seen by a raw grpc-js client. */
export interface SystemGrpcClient extends Client {
  getServerInfo: GrpcUnaryCall<GetServerInfoRequest, GetServerInfoResponse>;
  ping: GrpcUnaryCall<PingRequest, PingResponse>;
}

/** `patches.v1.AuthService` as seen by a raw grpc-js client. */
export interface AuthGrpcClient extends Client {
  register: GrpcUnaryCall<RegisterRequest, RegisterResponse>;
  verifyEmail: GrpcUnaryCall<VerifyEmailRequest, VerifyEmailResponse>;
  resendVerification: GrpcUnaryCall<ResendVerificationRequest, ResendVerificationResponse>;
  login: GrpcUnaryCall<LoginRequest, LoginResponse>;
  refreshSession: GrpcUnaryCall<RefreshSessionRequest, RefreshSessionResponse>;
  logout: GrpcUnaryCall<LogoutRequest, LogoutResponse>;
  logoutAllSessions: GrpcUnaryCall<LogoutAllSessionsRequest, LogoutAllSessionsResponse>;
  requestPasswordReset: GrpcUnaryCall<RequestPasswordResetRequest, RequestPasswordResetResponse>;
  resetPassword: GrpcUnaryCall<ResetPasswordRequest, ResetPasswordResponse>;
  getCurrentSession: GrpcUnaryCall<GetCurrentSessionRequest, GetCurrentSessionResponse>;
  beginSshLogin: GrpcUnaryCall<BeginSshLoginRequest, BeginSshLoginResponse>;
  completeSshLogin: GrpcUnaryCall<CompleteSshLoginRequest, CompleteSshLoginResponse>;
  beginSshEnrollment: GrpcUnaryCall<BeginSshEnrollmentRequest, BeginSshEnrollmentResponse>;
  beginGitHubLogin: GrpcUnaryCall<BeginGitHubLoginRequest, BeginGitHubLoginResponse>;
  pollGitHubLogin: GrpcUnaryCall<PollGitHubLoginRequest, PollGitHubLoginResponse>;
  listCredentials: GrpcUnaryCall<ListCredentialsRequest, ListCredentialsResponse>;
  addCredential: GrpcUnaryCall<AddCredentialRequest, AddCredentialResponse>;
  revokeCredential: GrpcUnaryCall<RevokeCredentialRequest, RevokeCredentialResponse>;
}

/** `patches.v1.ActorService` as seen by a raw grpc-js client. */
export interface ActorGrpcClient extends Client {
  getActor: GrpcUnaryCall<GetActorRequest, GetActorResponse>;
  getActorByHandle: GrpcUnaryCall<GetActorByHandleRequest, GetActorByHandleResponse>;
  updateProfile: GrpcUnaryCall<UpdateProfileRequest, UpdateProfileResponse>;
  searchActors: GrpcUnaryCall<SearchActorsRequest, SearchActorsResponse>;
  listFollowers: GrpcUnaryCall<ListFollowersRequest, ListFollowersResponse>;
  listFollowing: GrpcUnaryCall<ListFollowingRequest, ListFollowingResponse>;
  resolveActor: GrpcUnaryCall<ResolveActorRequest, ResolveActorResponse>;
}

/** `patches.v1.PostService` as seen by a raw grpc-js client. */
export interface PostGrpcClient extends Client {
  createPost: GrpcUnaryCall<CreatePostRequest, CreatePostResponse>;
  getPost: GrpcUnaryCall<GetPostRequest, GetPostResponse>;
  deletePost: GrpcUnaryCall<DeletePostRequest, DeletePostResponse>;
  listReplies: GrpcUnaryCall<ListRepliesRequest, ListRepliesResponse>;
  editPost: GrpcUnaryCall<EditPostRequest, EditPostResponse>;
  listPostEdits: GrpcUnaryCall<ListPostEditsRequest, ListPostEditsResponse>;
  pinPost: GrpcUnaryCall<PinPostRequest, PinPostResponse>;
  unpinPost: GrpcUnaryCall<UnpinPostRequest, UnpinPostResponse>;
  searchPosts: GrpcUnaryCall<SearchPostsRequest, SearchPostsResponse>;
}

/** `patches.v1.FeedService` as seen by a raw grpc-js client. */
export interface FeedGrpcClient extends Client {
  listHomeFeed: GrpcUnaryCall<ListHomeFeedRequest, ListHomeFeedResponse>;
  listLocalFeed: GrpcUnaryCall<ListLocalFeedRequest, ListLocalFeedResponse>;
  listActorPosts: GrpcUnaryCall<ListActorPostsRequest, ListActorPostsResponse>;
  listTagFeed: GrpcUnaryCall<ListTagFeedRequest, ListTagFeedResponse>;
  listCommunityFeed: GrpcUnaryCall<ListCommunityFeedRequest, ListCommunityFeedResponse>;
}

/** `patches.v1.SocialGraphService` as seen by a raw grpc-js client. */
export interface SocialGraphGrpcClient extends Client {
  followActor: GrpcUnaryCall<FollowActorRequest, FollowActorResponse>;
  unfollowActor: GrpcUnaryCall<UnfollowActorRequest, UnfollowActorResponse>;
  getRelationship: GrpcUnaryCall<GetRelationshipRequest, GetRelationshipResponse>;
  listMutualFollows: GrpcUnaryCall<ListMutualFollowsRequest, ListMutualFollowsResponse>;
}

/** `patches.v1.NodeService` as seen by a raw grpc-js client. */
export interface NodeGrpcClient extends Client {
  getNodeInfo: GrpcUnaryCall<GetNodeInfoRequest, GetNodeInfoResponse>;
}

/** `patches.v1.ReactionService` as seen by a raw grpc-js client. */
export interface ReactionGrpcClient extends Client {
  likePost: GrpcUnaryCall<LikePostRequest, LikePostResponse>;
  unlikePost: GrpcUnaryCall<UnlikePostRequest, UnlikePostResponse>;
  bookmarkPost: GrpcUnaryCall<BookmarkPostRequest, BookmarkPostResponse>;
  unbookmarkPost: GrpcUnaryCall<UnbookmarkPostRequest, UnbookmarkPostResponse>;
  listBookmarks: GrpcUnaryCall<ListBookmarksRequest, ListBookmarksResponse>;
  listPostLikers: GrpcUnaryCall<ListPostLikersRequest, ListPostLikersResponse>;
  repostPost: GrpcUnaryCall<RepostPostRequest, RepostPostResponse>;
  unrepostPost: GrpcUnaryCall<UnrepostPostRequest, UnrepostPostResponse>;
  listPostReposters: GrpcUnaryCall<ListPostRepostersRequest, ListPostRepostersResponse>;
}

/** `patches.v1.NotificationService` as seen by a raw grpc-js client. */
export interface NotificationGrpcClient extends Client {
  listNotifications: GrpcUnaryCall<ListNotificationsRequest, ListNotificationsResponse>;
  markNotificationsRead: GrpcUnaryCall<MarkNotificationsReadRequest, MarkNotificationsReadResponse>;
  getUnreadCount: GrpcUnaryCall<GetUnreadCountRequest, GetUnreadCountResponse>;
}

/** `patches.v1.ModerationService` as seen by a raw grpc-js client. */
export interface ModerationGrpcClient extends Client {
  blockActor: GrpcUnaryCall<BlockActorRequest, BlockActorResponse>;
  unblockActor: GrpcUnaryCall<UnblockActorRequest, UnblockActorResponse>;
  muteActor: GrpcUnaryCall<MuteActorRequest, MuteActorResponse>;
  unmuteActor: GrpcUnaryCall<UnmuteActorRequest, UnmuteActorResponse>;
  listBlocks: GrpcUnaryCall<ListBlocksRequest, ListBlocksResponse>;
  listMutes: GrpcUnaryCall<ListMutesRequest, ListMutesResponse>;
  reportPost: GrpcUnaryCall<ReportPostRequest, ReportPostResponse>;
  reportActor: GrpcUnaryCall<ReportActorRequest, ReportActorResponse>;
  reportMessage: GrpcUnaryCall<ReportMessageRequest, ReportMessageResponse>;
}

/** `patches.v1.MediaService` as seen by a raw grpc-js client. */
export interface MediaGrpcClient extends Client {
  beginMediaUpload: GrpcUnaryCall<BeginMediaUploadRequest, BeginMediaUploadResponse>;
  finalizeMediaUpload: GrpcUnaryCall<FinalizeMediaUploadRequest, FinalizeMediaUploadResponse>;
  getMediaDownload: GrpcUnaryCall<GetMediaDownloadRequest, GetMediaDownloadResponse>;
}

/** `patches.v1.PageService` as seen by a raw grpc-js client. */
export interface PageGrpcClient extends Client {
  getPage: GrpcUnaryCall<GetPageRequest, GetPageResponse>;
  updatePage: GrpcUnaryCall<UpdatePageRequest, UpdatePageResponse>;
  listPageRevisions: GrpcUnaryCall<ListPageRevisionsRequest, ListPageRevisionsResponse>;
  listGuestbook: GrpcUnaryCall<ListGuestbookRequest, ListGuestbookResponse>;
  signGuestbook: GrpcUnaryCall<SignGuestbookRequest, SignGuestbookResponse>;
  removeGuestbookEntry: GrpcUnaryCall<RemoveGuestbookEntryRequest, RemoveGuestbookEntryResponse>;
  reportGuestbookEntry: GrpcUnaryCall<ReportGuestbookEntryRequest, ReportGuestbookEntryResponse>;
}

/** `patches.v1.CommunityService` as seen by a raw grpc-js client. */
export interface CommunityGrpcClient extends Client {
  createCommunity: GrpcUnaryCall<CreateCommunityRequest, CreateCommunityResponse>;
  getCommunity: GrpcUnaryCall<GetCommunityRequest, GetCommunityResponse>;
  listCommunities: GrpcUnaryCall<ListCommunitiesRequest, ListCommunitiesResponse>;
  joinCommunity: GrpcUnaryCall<JoinCommunityRequest, JoinCommunityResponse>;
  leaveCommunity: GrpcUnaryCall<LeaveCommunityRequest, LeaveCommunityResponse>;
  listCommunityMembers: GrpcUnaryCall<ListCommunityMembersRequest, ListCommunityMembersResponse>;
  updateCommunity: GrpcUnaryCall<UpdateCommunityRequest, UpdateCommunityResponse>;
  setCommunityRole: GrpcUnaryCall<SetCommunityRoleRequest, SetCommunityRoleResponse>;
  removePostFromCommunity: GrpcUnaryCall<
    RemovePostFromCommunityRequest,
    RemovePostFromCommunityResponse
  >;
  banFromCommunity: GrpcUnaryCall<BanFromCommunityRequest, BanFromCommunityResponse>;
  inviteToCommunity: GrpcUnaryCall<InviteToCommunityRequest, InviteToCommunityResponse>;
  respondToCommunityInvite: GrpcUnaryCall<
    RespondToCommunityInviteRequest,
    RespondToCommunityInviteResponse
  >;
}

/** `patches.v1.DirectMessageService` as seen by a raw grpc-js client. */
export interface DirectMessageGrpcClient extends Client {
  listConversations: GrpcUnaryCall<ListConversationsRequest, ListConversationsResponse>;
  getConversation: GrpcUnaryCall<GetConversationRequest, GetConversationResponse>;
  listMessages: GrpcUnaryCall<ListMessagesRequest, ListMessagesResponse>;
  sendMessage: GrpcUnaryCall<SendMessageRequest, SendMessageResponse>;
  deleteMessage: GrpcUnaryCall<DeleteMessageRequest, DeleteMessageResponse>;
  createConversation: GrpcUnaryCall<CreateConversationRequest, CreateConversationResponse>;
  leaveConversation: GrpcUnaryCall<LeaveConversationRequest, LeaveConversationResponse>;
  markConversationRead: GrpcUnaryCall<MarkConversationReadRequest, MarkConversationReadResponse>;
  listMessageRequests: GrpcUnaryCall<ListMessageRequestsRequest, ListMessageRequestsResponse>;
  respondToMessageRequest: GrpcUnaryCall<
    RespondToMessageRequestRequest,
    RespondToMessageRequestResponse
  >;
}

/** `patches.v1.TagService` as seen by a raw grpc-js client. */
export interface TagGrpcClient extends Client {
  searchTags: GrpcUnaryCall<SearchTagsRequest, SearchTagsResponse>;
  muteTag: GrpcUnaryCall<MuteTagRequest, MuteTagResponse>;
  unmuteTag: GrpcUnaryCall<UnmuteTagRequest, UnmuteTagResponse>;
  listMutedTags: GrpcUnaryCall<ListMutedTagsRequest, ListMutedTagsResponse>;
}
