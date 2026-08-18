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
export {
  POST_SERVICE_NAME,
  PostServiceControllerMethods,
  PostType,
  PostVisibility,
} from './generated/patches/v1/posts.js';

export type {
  FeedServiceClient,
  FeedServiceController,
  ListActorPostsRequest,
  ListActorPostsResponse,
  ListHomeFeedRequest,
  ListHomeFeedResponse,
  ListLocalFeedRequest,
  ListLocalFeedResponse,
} from './generated/patches/v1/feeds.js';
export { FEED_SERVICE_NAME, FeedServiceControllerMethods } from './generated/patches/v1/feeds.js';

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
} from './generated/patches/v1/node.js';
export {
  NODE_SERVICE_NAME,
  NodeServiceControllerMethods,
  RegistrationMode,
} from './generated/patches/v1/node.js';
