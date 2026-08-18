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
  ListHomeFeedRequest,
  ListHomeFeedResponse,
  ListLocalFeedRequest,
  ListLocalFeedResponse,
  ListActorPostsRequest,
  ListActorPostsResponse,
} from './generated/patches/v1/feeds.js';
import type {
  CreatePostRequest,
  CreatePostResponse,
  DeletePostRequest,
  DeletePostResponse,
  GetPostRequest,
  GetPostResponse,
  ListRepliesRequest,
  ListRepliesResponse,
} from './generated/patches/v1/posts.js';
import type {
  GetServerInfoRequest,
  GetServerInfoResponse,
  PingRequest,
  PingResponse,
} from './generated/patches/v1/system.js';
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
}

/** `patches.v1.PostService` as seen by a raw grpc-js client. */
export interface PostGrpcClient extends Client {
  createPost: GrpcUnaryCall<CreatePostRequest, CreatePostResponse>;
  getPost: GrpcUnaryCall<GetPostRequest, GetPostResponse>;
  deletePost: GrpcUnaryCall<DeletePostRequest, DeletePostResponse>;
  listReplies: GrpcUnaryCall<ListRepliesRequest, ListRepliesResponse>;
}

/** `patches.v1.FeedService` as seen by a raw grpc-js client. */
export interface FeedGrpcClient extends Client {
  listHomeFeed: GrpcUnaryCall<ListHomeFeedRequest, ListHomeFeedResponse>;
  listLocalFeed: GrpcUnaryCall<ListLocalFeedRequest, ListLocalFeedResponse>;
  listActorPosts: GrpcUnaryCall<ListActorPostsRequest, ListActorPostsResponse>;
}
