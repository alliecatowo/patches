/**
 * Nest-flavoured generated output: controller/client interfaces, the
 * `@XxxServiceControllerMethods()` class decorators, and enum values.
 *
 * Kept out of the package root on purpose — these modules import
 * `@nestjs/microservices` at runtime, and the ESM Ink TUI must never load Nest.
 * Only `apps/server` should import from `@patches/proto/nest`.
 *
 * Named re-exports rather than `export *` from every generated module: each generated file
 * declares its own `protobufPackage`/`PATCHES_V1_PACKAGE_NAME` constants (identical value,
 * same name), so a blanket `export *` from more than one of them is an ambiguous-export
 * compile error. `system.js`'s copy is exported once for both; the others are excluded here
 * on purpose, not missing.
 */
export * from './generated/patches/v1/system.js';

export type {
  Actor,
  ActorCounts,
  ActorFlair,
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
  ResolveActorRequest,
  ResolveActorResponse,
  SearchActorsRequest,
  SearchActorsResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from './generated/patches/v1/actors.js';
export {
  ACTOR_SERVICE_NAME,
  ActorServiceControllerMethods,
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
export {
  AUTH_SERVICE_NAME,
  AuthServiceControllerMethods,
  CredentialType,
  GitHubLoginStatus,
} from './generated/patches/v1/auth.js';

export type {
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
  MediaAttachment,
  PinPostRequest,
  PinPostResponse,
  Post,
  PostCounts,
  PostEdit,
  PostServiceClient,
  PostServiceController,
  PostViewerState,
  UnpinPostRequest,
  UnpinPostResponse,
} from './generated/patches/v1/posts.js';
export {
  POST_SERVICE_NAME,
  PostServiceControllerMethods,
  PostType,
  PostVisibility,
  QuotePolicy,
} from './generated/patches/v1/posts.js';

export type {
  FeedServiceClient,
  FeedServiceController,
  ListActorPostsRequest,
  ListActorPostsResponse,
  ListCommunityFeedRequest,
  ListCommunityFeedResponse,
  ListHomeFeedRequest,
  ListHomeFeedResponse,
  ListLocalFeedRequest,
  ListLocalFeedResponse,
  ListTagFeedRequest,
  ListTagFeedResponse,
} from './generated/patches/v1/feeds.js';
export { FEED_SERVICE_NAME, FeedServiceControllerMethods } from './generated/patches/v1/feeds.js';

export type {
  FollowActorRequest,
  FollowActorResponse,
  GetRelationshipRequest,
  GetRelationshipResponse,
  ListMutualFollowsRequest,
  ListMutualFollowsResponse,
  Relationship,
  SocialGraphServiceClient,
  SocialGraphServiceController,
  UnfollowActorRequest,
  UnfollowActorResponse,
} from './generated/patches/v1/social_graph.js';
export {
  FollowState,
  SOCIAL_GRAPH_SERVICE_NAME,
  SocialGraphServiceControllerMethods,
} from './generated/patches/v1/social_graph.js';

export type {
  GetNodeInfoRequest,
  GetNodeInfoResponse,
  NodeLimits,
  NodeServiceClient,
  NodeServiceController,
  SocialCapabilities,
} from './generated/patches/v1/node.js';
export {
  NODE_SERVICE_NAME,
  NodeServiceControllerMethods,
  RegistrationMode,
} from './generated/patches/v1/node.js';

export type {
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
  ReactionServiceClient,
  ReactionServiceController,
  RepostPostRequest,
  RepostPostResponse,
  UnbookmarkPostRequest,
  UnbookmarkPostResponse,
  UnlikePostRequest,
  UnlikePostResponse,
  UnrepostPostRequest,
  UnrepostPostResponse,
} from './generated/patches/v1/reactions.js';
export {
  REACTION_SERVICE_NAME,
  ReactionServiceControllerMethods,
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
export {
  NOTIFICATION_SERVICE_NAME,
  NotificationServiceControllerMethods,
  NotificationType,
} from './generated/patches/v1/notifications.js';

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
  ReportMessageRequest,
  ReportMessageResponse,
  ReportPostRequest,
  ReportPostResponse,
  UnblockActorRequest,
  UnblockActorResponse,
  UnmuteActorRequest,
  UnmuteActorResponse,
} from './generated/patches/v1/moderation.js';
export {
  MODERATION_SERVICE_NAME,
  ModerationServiceControllerMethods,
  ReportReason,
} from './generated/patches/v1/moderation.js';

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
export {
  MEDIA_SERVICE_NAME,
  MediaServiceControllerMethods,
  MediaStatus,
} from './generated/patches/v1/media.js';

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
export { PAGE_SERVICE_NAME, PageServiceControllerMethods } from './generated/patches/v1/pages.js';

export type {
  BanFromCommunityRequest,
  BanFromCommunityResponse,
  Community,
  CommunityCounts,
  CommunityInvite,
  CommunityMember,
  CommunityServiceClient,
  CommunityServiceController,
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
export {
  COMMUNITY_SERVICE_NAME,
  CommunityInviteStatus,
  CommunityRole,
  CommunityServiceControllerMethods,
} from './generated/patches/v1/communities.js';

export type {
  Conversation,
  ConversationMember,
  CreateConversationRequest,
  CreateConversationResponse,
  DeleteMessageRequest,
  DeleteMessageResponse,
  DirectMessageServiceClient,
  DirectMessageServiceController,
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
  Message,
  MessageRequest,
  RespondToMessageRequestRequest,
  RespondToMessageRequestResponse,
  SendMessageRequest,
  SendMessageResponse,
} from './generated/patches/v1/messages.js';
export {
  ConversationKind,
  DIRECT_MESSAGE_SERVICE_NAME,
  DirectMessageServiceControllerMethods,
  MessageRequestStatus,
} from './generated/patches/v1/messages.js';

export type {
  ListMutedTagsRequest,
  ListMutedTagsResponse,
  MuteTagRequest,
  MuteTagResponse,
  SearchTagsRequest,
  SearchTagsResponse,
  Tag,
  TagServiceClient,
  TagServiceController,
  UnmuteTagRequest,
  UnmuteTagResponse,
} from './generated/patches/v1/tags.js';
export { TAG_SERVICE_NAME, TagServiceControllerMethods } from './generated/patches/v1/tags.js';
