/**
 * `@patches/proto` — the client/server contract.
 *
 * The generated protobuf **types** are re-exported here with `export type`, so
 * importing this entry point never pulls `@nestjs/microservices` (or Nest's DI
 * runtime) into the ESM Ink TUI. Code that needs the generated Nest decorators —
 * i.e. only `apps/server` — imports them from `@patches/proto/nest`.
 */

// Explicit type re-exports rather than `export type *`: the generated modules
// each declare `protobufPackage`/`PATCHES_V1_PACKAGE_NAME`, and star-exporting
// several of them would make those names ambiguous.
export type { Timestamp } from './generated/google/protobuf/timestamp.js';
export type { PageInfo } from './generated/patches/v1/common.js';
export type {
  GetServerInfoRequest,
  GetServerInfoResponse,
  PingRequest,
  PingResponse,
  SystemServiceClient,
  SystemServiceController,
} from './generated/patches/v1/system.js';
export type {
  Actor,
  ActorCounts,
  ActorServiceClient,
  ActorServiceController,
  GetActorByHandleRequest,
  GetActorByHandleResponse,
  GetActorRequest,
  GetActorResponse,
  ListFollowersRequest,
  ListFollowersResponse,
  ListFollowingRequest,
  ListFollowingResponse,
  MediaRef,
  Nameplate,
  SearchActorsRequest,
  SearchActorsResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from './generated/patches/v1/actors.js';
export type {
  AddCredentialRequest,
  AddCredentialResponse,
  AuthServiceClient,
  AuthServiceController,
  BeginGitHubLoginRequest,
  BeginGitHubLoginResponse,
  BeginSshEnrollmentRequest,
  BeginSshEnrollmentResponse,
  BeginSshLoginRequest,
  BeginSshLoginResponse,
  CompleteSshLoginRequest,
  CompleteSshLoginResponse,
  Credential,
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
  Session,
  SshEnrollmentProof,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from './generated/patches/v1/auth.js';
// Enum *types* only here — `export type` is erased at compile time, unlike a value export
// (see `enums.ts` for why the runtime values come from a hand-mirrored module instead).
export type { CredentialType, GitHubLoginStatus } from './generated/patches/v1/auth.js';
export type {
  ListActorPostsRequest,
  ListActorPostsResponse,
  ListHomeFeedRequest,
  ListHomeFeedResponse,
  ListLocalFeedRequest,
  ListLocalFeedResponse,
  FeedServiceClient,
  FeedServiceController,
} from './generated/patches/v1/feeds.js';
export type {
  CreatePostRequest,
  CreatePostResponse,
  DeletePostRequest,
  DeletePostResponse,
  GetPostRequest,
  GetPostResponse,
  ListRepliesRequest,
  ListRepliesResponse,
  MediaAttachment,
  Post,
  PostCounts,
  PostServiceClient,
  PostServiceController,
  PostViewerState,
} from './generated/patches/v1/posts.js';
export type { PostType, PostVisibility } from './generated/patches/v1/posts.js';
export type {
  FollowActorRequest,
  FollowActorResponse,
  GetRelationshipRequest,
  GetRelationshipResponse,
  Relationship,
  SocialGraphServiceClient,
  SocialGraphServiceController,
  UnfollowActorRequest,
  UnfollowActorResponse,
} from './generated/patches/v1/social_graph.js';
export type { FollowState } from './generated/patches/v1/social_graph.js';
export type {
  GetNodeInfoRequest,
  GetNodeInfoResponse,
  NodeLimits,
  NodeServiceClient,
  NodeServiceController,
} from './generated/patches/v1/node.js';
export type { RegistrationMode } from './generated/patches/v1/node.js';
export type {
  BookmarkPostRequest,
  BookmarkPostResponse,
  ListBookmarksRequest,
  ListBookmarksResponse,
  ListPostLikersRequest,
  ListPostLikersResponse,
  LikePostRequest,
  LikePostResponse,
  ReactionServiceClient,
  ReactionServiceController,
  UnbookmarkPostRequest,
  UnbookmarkPostResponse,
  UnlikePostRequest,
  UnlikePostResponse,
} from './generated/patches/v1/reactions.js';
export type {
  GetUnreadCountRequest,
  GetUnreadCountResponse,
  ListNotificationsRequest,
  ListNotificationsResponse,
  MarkNotificationsReadRequest,
  MarkNotificationsReadResponse,
  Notification,
  NotificationServiceClient,
  NotificationServiceController,
} from './generated/patches/v1/notifications.js';
export type { NotificationType } from './generated/patches/v1/notifications.js';
export type {
  BlockActorRequest,
  BlockActorResponse,
  ListBlocksRequest,
  ListBlocksResponse,
  ListMutesRequest,
  ListMutesResponse,
  ModerationServiceClient,
  ModerationServiceController,
  MuteActorRequest,
  MuteActorResponse,
  ReportActorRequest,
  ReportActorResponse,
  ReportPostRequest,
  ReportPostResponse,
  UnblockActorRequest,
  UnblockActorResponse,
  UnmuteActorRequest,
  UnmuteActorResponse,
} from './generated/patches/v1/moderation.js';
export type { ReportReason } from './generated/patches/v1/moderation.js';
export type {
  BeginMediaUploadRequest,
  BeginMediaUploadResponse,
  FinalizeMediaUploadRequest,
  FinalizeMediaUploadResponse,
  GetMediaDownloadRequest,
  GetMediaDownloadResponse,
  MediaServiceClient,
  MediaServiceController,
} from './generated/patches/v1/media.js';
export type { MediaStatus } from './generated/patches/v1/media.js';
export type {
  GetPageRequest,
  GetPageResponse,
  GuestbookEntry,
  ListGuestbookRequest,
  ListGuestbookResponse,
  ListPageRevisionsRequest,
  ListPageRevisionsResponse,
  PageRevisionSummary,
  PageServiceClient,
  PageServiceController,
  PageTheme,
  RemoveGuestbookEntryRequest,
  RemoveGuestbookEntryResponse,
  ReportGuestbookEntryRequest,
  ReportGuestbookEntryResponse,
  SignGuestbookRequest,
  SignGuestbookResponse,
  UpdatePageRequest,
  UpdatePageResponse,
} from './generated/patches/v1/pages.js';

export {
  CREDENTIAL_TYPE,
  FOLLOW_STATE,
  GITHUB_LOGIN_STATUS,
  MEDIA_STATUS,
  NOTIFICATION_TYPE,
  POST_TYPE,
  POST_VISIBILITY,
  REGISTRATION_MODE,
  REPORT_REASON,
} from './enums.js';
export {
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
} from './client.js';
export {
  DEADLINES_MS,
  ERROR_CODE_METADATA_KEY,
  GRPC_PACKAGES,
  METADATA_KEYS,
  MIN_CLIENT_VERSION,
  PATCHES_PACKAGE_NAME,
  PROTO_LOADER_OPTIONS,
  PROTOCOL_VERSION,
  SERVICE_NAMES,
} from './constants.js';
export type {
  ActorGrpcClient,
  AuthGrpcClient,
  FeedGrpcClient,
  GrpcUnaryCall,
  MediaGrpcClient,
  ModerationGrpcClient,
  NodeGrpcClient,
  NotificationGrpcClient,
  PageGrpcClient,
  PostGrpcClient,
  ReactionGrpcClient,
  SocialGraphGrpcClient,
  SystemGrpcClient,
} from './constants.js';
export { getProtoDir, getProtoFiles, protoFile } from './proto-path.js';
export { dateToTimestamp, timestampToDate } from './timestamps.js';
