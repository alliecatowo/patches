import { randomUUID } from 'node:crypto';

import { status as GrpcStatus } from '@grpc/grpc-js';
import { parsePageStrict, type PatchesPage } from '@patches/domain';
import {
  FOLLOW_STATE,
  MEDIA_STATUS,
  POST_TYPE,
  POST_VISIBILITY,
  QUOTE_POLICY,
} from '../src/api/wire/enums.js';
import { fromDate } from '../src/api/wire/time.js';
import {
  type Actor,
  type AddCredentialRequest as AddCredentialRequestInit,
  type AddCredentialResponse,
  type BeginMediaUploadRequest as BeginMediaUploadRequestInit,
  type BeginMediaUploadResponse,
  type BlockActorRequest as BlockActorRequestInit,
  type BlockActorResponse,
  type BookmarkPostRequest as BookmarkPostRequestInit,
  type BookmarkPostResponse,
  type CreatePostRequest as CreatePostRequestInit,
  type CreatePostResponse,
  type Credential,
  type FinalizeMediaUploadRequest as FinalizeMediaUploadRequestInit,
  type FinalizeMediaUploadResponse,
  type FollowActorRequest as FollowActorRequestInit,
  type FollowActorResponse,
  type GetActorByHandleRequest as GetActorByHandleRequestInit,
  type GetActorByHandleResponse,
  type GetActorRequest as GetActorRequestInit,
  type GetActorResponse,
  type GetMediaDownloadRequest as GetMediaDownloadRequestInit,
  type GetMediaDownloadResponse,
  type GetPageRequest as GetPageRequestInit,
  type GetPageResponse,
  type GetPostRequest as GetPostRequestInit,
  type GetPostResponse,
  type GetRelationshipRequest as GetRelationshipRequestInit,
  type GetRelationshipResponse,
  type GetServerInfoResponse,
  type GetUnreadCountRequest as GetUnreadCountRequestInit,
  type GetUnreadCountResponse,
  type GuestbookEntry,
  type LikePostRequest as LikePostRequestInit,
  type LikePostResponse,
  type ListActorPostsRequest as ListActorPostsRequestInit,
  type ListActorPostsResponse,
  type ListBlocksRequest as ListBlocksRequestInit,
  type ListBlocksResponse,
  type ListBookmarksRequest as ListBookmarksRequestInit,
  type ListBookmarksResponse,
  type ListGuestbookRequest as ListGuestbookRequestInit,
  type ListGuestbookResponse,
  type ListHomeFeedRequest as ListHomeFeedRequestInit,
  type ListHomeFeedResponse,
  type ListCredentialsResponse,
  type ListLocalFeedRequest as ListLocalFeedRequestInit,
  type ListLocalFeedResponse,
  type ListMutualFollowsRequest as ListMutualFollowsRequestInit,
  type ListMutualFollowsResponse,
  type ListMutesRequest as ListMutesRequestInit,
  type ListMutesResponse,
  type ListNotificationsRequest as ListNotificationsRequestInit,
  type ListNotificationsResponse,
  type ListPageRevisionsRequest as ListPageRevisionsRequestInit,
  type ListPageRevisionsResponse,
  type ListPostLikersRequest as ListPostLikersRequestInit,
  type ListPostLikersResponse,
  type ListRepliesRequest as ListRepliesRequestInit,
  type ListRepliesResponse,
  type LoginRequest as LoginRequestInit,
  type LoginResponse,
  type MarkNotificationsReadRequest as MarkNotificationsReadRequestInit,
  type MarkNotificationsReadResponse,
  type MediaAttachment,
  type MuteActorRequest as MuteActorRequestInit,
  type MuteActorResponse,
  type Nameplate,
  type Notification,
  type NotificationType,
  type PageInfo,
  type Post,
  type RefreshSessionRequest as RefreshSessionRequestInit,
  type RefreshSessionResponse,
  type RegisterRequest as RegisterRequestInit,
  type RegisterResponse,
  type Relationship,
  type RemoveGuestbookEntryRequest as RemoveGuestbookEntryRequestInit,
  type RemoveGuestbookEntryResponse,
  type ReportActorRequest as ReportActorRequestInit,
  type ReportActorResponse,
  type ReportGuestbookEntryRequest as ReportGuestbookEntryRequestInit,
  type ReportGuestbookEntryResponse,
  type ReportPostRequest as ReportPostRequestInit,
  type ReportPostResponse,
  type ResendVerificationResponse,
  type ResolveActorRequest as ResolveActorRequestInit,
  type ResolveActorResponse,
  type SearchActorsRequest as SearchActorsRequestInit,
  type SearchActorsResponse,
  type Session,
  type SignGuestbookRequest as SignGuestbookRequestInit,
  type SignGuestbookResponse,
  type UnblockActorRequest as UnblockActorRequestInit,
  type UnblockActorResponse,
  type UnbookmarkPostRequest as UnbookmarkPostRequestInit,
  type UnbookmarkPostResponse,
  type UnfollowActorRequest as UnfollowActorRequestInit,
  type UnfollowActorResponse,
  type UnlikePostRequest as UnlikePostRequestInit,
  type UnlikePostResponse,
  type UnmuteActorRequest as UnmuteActorRequestInit,
  type UnmuteActorResponse,
  type UpdatePageRequest as UpdatePageRequestInit,
  type UpdatePageResponse,
  type UpdateProfileRequest as UpdateProfileRequestInit,
  type UpdateProfileResponse,
  type VerifyEmailRequest as VerifyEmailRequestInit,
  type VerifyEmailResponse,
} from '../src/api/wire/types.js';

import type { PatchesApi } from '../src/api/client.js';

/** Narrows a `WireInit<T>` request type (`src/api/wire/types.ts`) down to the
 * fully-decoded shape - the fake server always receives a complete, `$typeName`-bearing
 * message, never the lenient partial-init shape callers are allowed to construct. */
type Full<T> = Extract<T, { readonly $typeName: string }>;

type AddCredentialRequest = Full<AddCredentialRequestInit>;
type BeginMediaUploadRequest = Full<BeginMediaUploadRequestInit>;
type BlockActorRequest = Full<BlockActorRequestInit>;
type BookmarkPostRequest = Full<BookmarkPostRequestInit>;
type CreatePostRequest = Full<CreatePostRequestInit>;
type FinalizeMediaUploadRequest = Full<FinalizeMediaUploadRequestInit>;
type FollowActorRequest = Full<FollowActorRequestInit>;
type GetActorByHandleRequest = Full<GetActorByHandleRequestInit>;
type GetActorRequest = Full<GetActorRequestInit>;
type GetMediaDownloadRequest = Full<GetMediaDownloadRequestInit>;
type GetPageRequest = Full<GetPageRequestInit>;
type GetPostRequest = Full<GetPostRequestInit>;
type GetRelationshipRequest = Full<GetRelationshipRequestInit>;
type GetUnreadCountRequest = Full<GetUnreadCountRequestInit>;
type LikePostRequest = Full<LikePostRequestInit>;
type ListActorPostsRequest = Full<ListActorPostsRequestInit>;
type ListBlocksRequest = Full<ListBlocksRequestInit>;
type ListBookmarksRequest = Full<ListBookmarksRequestInit>;
type ListGuestbookRequest = Full<ListGuestbookRequestInit>;
type ListHomeFeedRequest = Full<ListHomeFeedRequestInit>;
type ListLocalFeedRequest = Full<ListLocalFeedRequestInit>;
type ListMutualFollowsRequest = Full<ListMutualFollowsRequestInit>;
type ListMutesRequest = Full<ListMutesRequestInit>;
type ListNotificationsRequest = Full<ListNotificationsRequestInit>;
type ListPageRevisionsRequest = Full<ListPageRevisionsRequestInit>;
type ListPostLikersRequest = Full<ListPostLikersRequestInit>;
type ListRepliesRequest = Full<ListRepliesRequestInit>;
type LoginRequest = Full<LoginRequestInit>;
type MarkNotificationsReadRequest = Full<MarkNotificationsReadRequestInit>;
type MuteActorRequest = Full<MuteActorRequestInit>;
type RefreshSessionRequest = Full<RefreshSessionRequestInit>;
type RegisterRequest = Full<RegisterRequestInit>;
type RemoveGuestbookEntryRequest = Full<RemoveGuestbookEntryRequestInit>;
type ReportActorRequest = Full<ReportActorRequestInit>;
type ReportGuestbookEntryRequest = Full<ReportGuestbookEntryRequestInit>;
type ReportPostRequest = Full<ReportPostRequestInit>;
type ResolveActorRequest = Full<ResolveActorRequestInit>;
type SearchActorsRequest = Full<SearchActorsRequestInit>;
type SignGuestbookRequest = Full<SignGuestbookRequestInit>;
type UnblockActorRequest = Full<UnblockActorRequestInit>;
type UnbookmarkPostRequest = Full<UnbookmarkPostRequestInit>;
type UnfollowActorRequest = Full<UnfollowActorRequestInit>;
type UnlikePostRequest = Full<UnlikePostRequestInit>;
type UnmuteActorRequest = Full<UnmuteActorRequestInit>;
type UpdatePageRequest = Full<UpdatePageRequestInit>;
type UpdateProfileRequest = Full<UpdateProfileRequestInit>;
type VerifyEmailRequest = Full<VerifyEmailRequestInit>;

/** URL prefixes the fake `fetch` override recognizes as its own "object storage" — anything
 * else passes through to the real global `fetch` untouched (spec §30's direct-to-R2 upload
 * flow, faked end to end for `apps/tui/test` without a real HTTP server). */
const FAKE_UPLOAD_PREFIX = 'https://fake-upload.patches.test/';
const FAKE_DOWNLOAD_PREFIX = 'https://fake-download.patches.test/';

let realFetch: typeof fetch | undefined;
let activeMediaTarget: FakeApiHandle | undefined;

async function readRequestBody(body: unknown): Promise<Uint8Array> {
  if (body === null || body === undefined) return new Uint8Array();
  if (body instanceof Uint8Array) return body;
  if (typeof body === 'string') return new TextEncoder().encode(body);
  const stream = body as ReadableStream<Uint8Array>;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Installed once per process — the wrapper itself is stateless and defers to whichever
 * `FakeApiHandle` was constructed most recently (mirrors how every other fake RPC method is
 * scoped to "the current test's handle", not a registry keyed by request). */
function installFakeMediaFetch(): void {
  if (realFetch !== undefined) return;
  realFetch = globalThis.fetch.bind(globalThis);
  const previousFetch = realFetch;
  globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
    if (activeMediaTarget !== undefined && url.startsWith(FAKE_UPLOAD_PREFIX)) {
      return activeMediaTarget.handleFakeUpload(url, init);
    }
    if (activeMediaTarget !== undefined && url.startsWith(FAKE_DOWNLOAD_PREFIX)) {
      return activeMediaTarget.handleFakeDownload(url);
    }
    return previousFetch(input, init);
  };
}

interface FakeMedia {
  mimeType: string;
  byteSize: number;
  status: (typeof MEDIA_STATUS)[keyof typeof MEDIA_STATUS];
  bytes?: Uint8Array;
}

interface FakePage {
  document: PatchesPage;
  revisionId: string;
  updatedAt: Date;
}

/** A seeded local account the fake server knows about. */
export interface FakeUser {
  id: string;
  handle: string;
  password: string;
  displayName: string;
  bio: string;
  locationText?: string;
  websiteUrl?: string;
  /** Seeded directly, or set via `UpdateProfile`'s `nameplate` field + `"nameplate"` in
   * `update_mask` (A-037 nameplate-editing tests). */
  nameplate?: Nameplate;
  /** Defaults to `true` (most tests don't care) — set `false` to exercise the
   * unverified-email banner/`verify`/`resendVerification` paths (A-028). Mutated
   * in place by `verifyEmail` once the matching `verificationCode` is presented. */
  emailVerified?: boolean;
  /** The code `verifyEmail` accepts for this user — `undefined` means no code has
   * been "sent" (every `verifyEmail` call for this user fails). */
  verificationCode?: string;
}

interface FakeSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export interface FakeApiOptions {
  target?: string;
  /** Server identity for `getServerInfo` (spec §67 connect screen). */
  serverInfo?: Partial<GetServerInfoResponse>;
  /**
   * Overrides `getServerInfo` entirely — tests exercising the offline/retry
   * path (e.g. a `vi.fn` that rejects once then resolves) pass this instead of
   * `serverInfo`.
   */
  getServerInfoImpl?: () => Promise<GetServerInfoResponse>;
  /** How many posts a `ListLocalFeed`/`ListActorPosts` page returns — small by default so tests can exercise "load more" without seeding hundreds of posts. */
  pageSize?: number;
  /** `ResolveActor` rejects an `acct` on this domain as local (B-028) — defaults to the
   * `target` option's host portion when omitted. */
  localDomain?: string;
  /** `ResolveActor` throws `UNIMPLEMENTED` when `false` (B-028's "federation disabled"
   * case) — defaults to `true`. */
  federationEnabled?: boolean;
}

function grpcError(code: number, message: string): Error & { code: number } {
  return Object.assign(new Error(message), { code });
}

/**
 * An in-memory stand-in for the whole `PatchesApi` surface, so screens can be
 * driven end to end (login → compose → profile → local feed) without a real
 * gRPC server. Test files seed it via the returned handle, then hand
 * `handle.api` to `renderApp`.
 */
export class FakeApiHandle {
  readonly api: PatchesApi;
  readonly target: string;
  /** Every user id `resendVerification` was called for, in call order — tests assert
   * against this rather than the fake tracking a resend "count" per user (A-028). */
  readonly resendVerificationCalls: string[] = [];

  private readonly users = new Map<string, FakeUser>();
  private readonly posts: Post[] = []; // newest first
  private readonly sessions = new Map<string, FakeSession>(); // keyed by accessToken
  private readonly refreshTokens = new Map<string, FakeSession>(); // keyed by refreshToken
  private readonly follows = new Map<string, Set<string>>(); // followerId -> Set<followingId>
  private readonly likes = new Map<string, Set<string>>(); // postId -> Set<userId>
  private readonly bookmarks = new Map<string, string[]>(); // userId -> postIds, most-recent-first
  private readonly blocks = new Map<string, Set<string>>(); // userId -> Set<blockedActorId>
  private readonly mutes = new Map<string, Set<string>>(); // userId -> Set<mutedActorId>
  // `Notification` carries no recipient field of its own — that's implicit in "whose
  // `ListNotifications` returned it" — so this map's key encodes the (recipient,
  // notification) pairing, keyed by recipient user id, newest first per recipient.
  private readonly notificationsByUser = new Map<string, Notification[]>();
  private readonly credentialsByUser = new Map<string, Credential[]>(); // AccountsScreen (B-022)
  private readonly media = new Map<string, FakeMedia>(); // mediaId -> ... (P5-003/B-004)
  // (handle, slug || 'index') -> page document, joined with '/' (P45-004..006)
  private readonly pages = new Map<string, FakePage>();
  private readonly guestbook = new Map<string, GuestbookEntry[]>(); // same key as `pages`
  private readonly pageSize: number;
  private readonly serverInfo: GetServerInfoResponse;
  private readonly localDomain: string;
  private readonly federationEnabled: boolean;
  private readonly remoteActors = new Map<string, Actor>(); // acct ("user@domain") -> Actor (B-028)

  constructor(options: FakeApiOptions = {}) {
    installFakeMediaFetch();
    // Not a closure alias — a module-level "which handle is current" pointer the fetch
    // override reads later, so a test's second `createFakeApi()` correctly supersedes
    // its first.
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- see comment above
    activeMediaTarget = this;
    this.target = options.target ?? 'patches.test:50051';
    this.pageSize = options.pageSize ?? 20;
    this.localDomain = options.localDomain ?? this.target.split(':')[0] ?? 'patches.test';
    this.federationEnabled = options.federationEnabled ?? true;
    this.serverInfo = {
      $typeName: 'patches.v1.GetServerInfoResponse',
      serverVersion: '0.1.0',
      protocolVersion: 1,
      minClientVersion: '0.1.0',
      serverTime: fromDate(new Date('2026-08-17T21:00:00.000Z')),
      instanceName: 'patches-test',
      features: ['system.ping'],
      ...options.serverInfo,
    };

    // Cast rather than a structural interface: `PatchesApi` is the real class other
    // code imports the *type* of, so screens/hooks see exactly the surface they will
    // see in production — this is the same pattern `App.test.tsx` already used.
    this.api = {
      target: this.target,
      getServerInfo: options.getServerInfoImpl ?? (() => Promise.resolve(this.serverInfo)),
      ping: (nonce: string) => Promise.resolve({ nonce, serverTime: fromDate(new Date()) }),
      register: (request: RegisterRequest) => this.register(request),
      login: (request: LoginRequest) => this.login(request),
      // P15-002: always resolves 'optional' — no test currently exercises
      // PASSWORD_AUTH=off, so the default that preserves every existing password-
      // login test's behavior is the right one here.
      getAuthPolicy: () => Promise.resolve({ passwordAuth: 'PASSWORD_AUTH_MODE_OPTIONAL' }),
      refreshSession: (request: RefreshSessionRequest) => this.refreshSession(request),
      logout: () => Promise.resolve({}),
      verifyEmail: (request: VerifyEmailRequest) => this.verifyEmail(request),
      resendVerification: (accessToken: string) => this.resendVerification(accessToken),
      beginSshLogin: () =>
        Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: no ssh agent')),
      completeSshLogin: () =>
        Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: no ssh agent')),
      getCurrentSession: () =>
        Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: not needed by the tests')),
      logoutAllSessions: () => Promise.resolve({}),
      listCredentials: (accessToken: string) => this.listCredentials(accessToken),
      getActor: (request: GetActorRequest) => this.getActor(request),
      getActorByHandle: (request: GetActorByHandleRequest) => this.getActorByHandle(request),
      searchActors: (request: SearchActorsRequest) => this.searchActors(request),
      resolveActor: (request: ResolveActorRequest, accessToken: string) =>
        this.resolveActor(request, accessToken),
      updateProfile: (request: UpdateProfileRequest, accessToken: string) =>
        this.updateProfile(request, accessToken),
      listActorPosts: (request: ListActorPostsRequest) => this.listActorPosts(request),
      listLocalFeed: (request: ListLocalFeedRequest) => this.listLocalFeed(request),
      listHomeFeed: (request: ListHomeFeedRequest, accessToken: string) =>
        this.listHomeFeed(request, accessToken),
      followActor: (request: FollowActorRequest, accessToken: string) =>
        this.followActor(request, accessToken),
      unfollowActor: (request: UnfollowActorRequest, accessToken: string) =>
        this.unfollowActor(request, accessToken),
      getRelationship: (request: GetRelationshipRequest, accessToken: string) =>
        this.getRelationship(request, accessToken),
      listMutualFollows: (request: ListMutualFollowsRequest, accessToken?: string) =>
        this.listMutualFollows(request, accessToken),
      addCredential: (request: AddCredentialRequest, accessToken: string) =>
        this.addCredential(request, accessToken),
      revokeCredential: (request: { id: string }, accessToken: string) =>
        this.revokeCredential(request, accessToken),
      getNodeInfo: () =>
        Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: not needed by the tests')),
      getNodePolicy: () =>
        Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: not needed by the tests')),
      // A-053: App.tsx's session-start staleness check calls this alongside `getNodePolicy`
      // above — both reject the same way, so `Promise.all` in that effect rejects and the
      // check silently no-ops, exactly like every other test in this file that doesn't care
      // about it.
      getPrivacyPrefs: () =>
        Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: not needed by the tests')),
      createPost: (request: CreatePostRequest, accessToken: string) =>
        this.createPost(request, accessToken),
      getPost: (request: GetPostRequest) => this.getPost(request),
      listReplies: (request: ListRepliesRequest) => this.listReplies(request),
      deletePost: () =>
        Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: not needed by the tests')),
      likePost: (request: LikePostRequest, accessToken: string) =>
        this.likePost(request, accessToken),
      unlikePost: (request: UnlikePostRequest, accessToken: string) =>
        this.unlikePost(request, accessToken),
      bookmarkPost: (request: BookmarkPostRequest, accessToken: string) =>
        this.bookmarkPost(request, accessToken),
      unbookmarkPost: (request: UnbookmarkPostRequest, accessToken: string) =>
        this.unbookmarkPost(request, accessToken),
      listBookmarks: (request: ListBookmarksRequest, accessToken: string) =>
        this.listBookmarks(request, accessToken),
      listPostLikers: (request: ListPostLikersRequest) => this.listPostLikers(request),
      listNotifications: (request: ListNotificationsRequest, accessToken: string) =>
        this.listNotifications(request, accessToken),
      markNotificationsRead: (request: MarkNotificationsReadRequest, accessToken: string) =>
        this.markNotificationsRead(request, accessToken),
      getUnreadCount: (request: GetUnreadCountRequest, accessToken: string) =>
        this.getUnreadCount(request, accessToken),
      blockActor: (request: BlockActorRequest, accessToken: string) =>
        this.blockActor(request, accessToken),
      unblockActor: (request: UnblockActorRequest, accessToken: string) =>
        this.unblockActor(request, accessToken),
      muteActor: (request: MuteActorRequest, accessToken: string) =>
        this.muteActor(request, accessToken),
      unmuteActor: (request: UnmuteActorRequest, accessToken: string) =>
        this.unmuteActor(request, accessToken),
      listBlocks: (request: ListBlocksRequest, accessToken: string) =>
        this.listBlocks(request, accessToken),
      listMutes: (request: ListMutesRequest, accessToken: string) =>
        this.listMutes(request, accessToken),
      reportPost: (request: ReportPostRequest, accessToken: string) =>
        this.reportPost(request, accessToken),
      reportActor: (request: ReportActorRequest, accessToken: string) =>
        this.reportActor(request, accessToken),
      beginMediaUpload: (request: BeginMediaUploadRequest, accessToken: string) =>
        this.beginMediaUpload(request, accessToken),
      finalizeMediaUpload: (request: FinalizeMediaUploadRequest, accessToken: string) =>
        this.finalizeMediaUpload(request, accessToken),
      getMediaDownload: (request: GetMediaDownloadRequest, accessToken: string) =>
        this.getMediaDownload(request, accessToken),
      getPage: (request: GetPageRequest) => this.getPage(request),
      updatePage: (request: UpdatePageRequest, accessToken: string) =>
        this.updatePage(request, accessToken),
      listPageRevisions: (_request: ListPageRevisionsRequest, _accessToken: string) =>
        Promise.reject<ListPageRevisionsResponse>(
          grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: not needed by the tests'),
        ),
      listGuestbook: (request: ListGuestbookRequest) => this.listGuestbook(request),
      signGuestbook: (request: SignGuestbookRequest, accessToken: string) =>
        this.signGuestbook(request, accessToken),
      removeGuestbookEntry: (_request: RemoveGuestbookEntryRequest, _accessToken: string) =>
        Promise.reject<RemoveGuestbookEntryResponse>(
          grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: not needed by the tests'),
        ),
      reportGuestbookEntry: (_request: ReportGuestbookEntryRequest, _accessToken: string) =>
        Promise.reject<ReportGuestbookEntryResponse>(
          grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: not needed by the tests'),
        ),
      close: () => undefined,
    } as unknown as PatchesApi;
  }

  /** Registers a local account the fake server will accept `Login` for. */
  addUser(user: Omit<FakeUser, 'id'> & { id?: string }): FakeUser {
    const full: FakeUser = { id: user.id ?? randomUUID(), ...user };
    this.users.set(full.id, full);
    return full;
  }

  /** Seeds a remote actor `ResolveActor` can find by `acct` ("user@domain", no `acct:`
   * prefix, must not be `localDomain`) — B-028's TUI-side federation-discovery tests. */
  addRemoteActor(acct: string, actor: Actor): void {
    this.remoteActors.set(acct, actor);
  }

  /** Seeds a post directly (bypassing `CreatePost`), newest-first like the real feed.
   * Pass `inReplyToId` to seed a reply (P4-004's thread-screen tests), or `media` to
   * seed attachments (P5-003/B-004's `PostRow`/`ThreadScreen` rendering tests). */
  addPost(
    authorId: string,
    body: string,
    createdAt: Date = new Date(),
    inReplyToId = '',
    media: readonly MediaAttachment[] = [],
  ): Post {
    const post = this.buildPost(randomUUID(), authorId, body, createdAt, inReplyToId, media);
    this.posts.unshift(post);
    return post;
  }

  /** Registers a fake "already uploaded, READY" media object directly (bypassing
   * `BeginMediaUpload`/PUT/`FinalizeMediaUpload`) — for tests that only need an
   * attachment to exist, not the full upload flow. Also seeds `handleFakeDownload`'s
   * byte store so `o`/inline-image fetches resolve to real bytes. */
  addMedia(mediaId: string, bytes: Uint8Array, mimeType = 'image/png'): void {
    this.media.set(mediaId, {
      mimeType,
      byteSize: bytes.byteLength,
      status: MEDIA_STATUS.READY,
      bytes,
    });
  }

  /** Seeds a page document directly (bypassing `UpdatePage`) — for `PageScreen`/render
   * tests (P45-004..006). `slug` "" is the index page. */
  addPage(handle: string, slug: string, document: PatchesPage): void {
    this.pages.set(pageKey(handle, slug), {
      document,
      revisionId: randomUUID(),
      updatedAt: new Date(),
    });
  }

  /** Seeds a guestbook entry directly (bypassing `SignGuestbook`). */
  addGuestbookEntry(
    handle: string,
    slug: string,
    authorId: string,
    body: string,
    createdAt: Date = new Date(),
  ): GuestbookEntry {
    const user = this.users.get(authorId);
    if (user === undefined) throw new Error(`fake api: no such user ${authorId}`);
    const entry: GuestbookEntry = {
      $typeName: 'patches.v1.GuestbookEntry',
      id: randomUUID(),
      author: this.toActor(user),
      body,
      createdAt: fromDate(createdAt),
    };
    const key = pageKey(handle, slug);
    const list = this.guestbook.get(key) ?? [];
    list.unshift(entry);
    this.guestbook.set(key, list);
    return entry;
  }

  /** Seeds a follow relationship directly (bypassing `FollowActor`), for home-feed/relationship tests. */
  addFollow(followerId: string, followingId: string): void {
    const following = this.follows.get(followerId) ?? new Set<string>();
    following.add(followingId);
    this.follows.set(followerId, following);
  }

  /** Seeds a notification directly (bypassing whatever real action would create one),
   * for `NotificationsScreen`/unread-count tests (spec §56, §113). `forUserId` is whose
   * notification list this appears on, never the actor `readAt` if `read` is true. */
  addNotification(
    forUserId: string,
    type: NotificationType,
    options: { actorId?: string; postId?: string; createdAt?: Date; read?: boolean } = {},
  ): Notification {
    const actorUser = options.actorId === undefined ? undefined : this.users.get(options.actorId);
    const createdAt = options.createdAt ?? new Date();
    const notification: Notification = {
      $typeName: 'patches.v1.Notification',
      id: randomUUID(),
      type,
      actor: actorUser === undefined ? undefined : this.toActor(actorUser),
      postId: options.postId ?? '',
      createdAt: fromDate(createdAt),
      readAt: options.read === true ? fromDate(createdAt) : undefined,
      // Amendment B fields (P11-001) — fake-api has no message/community-invite notification
      // writer yet.
      conversationId: '',
      communityId: '',
    };
    this.notificationsFor(forUserId).unshift(notification);
    return notification;
  }

  private notificationsFor(userId: string): Notification[] {
    let list = this.notificationsByUser.get(userId);
    if (list === undefined) {
      list = [];
      this.notificationsByUser.set(userId, list);
    }
    return list;
  }

  /** Seeds a credential row directly (bypassing `AddCredential`), for `AccountsScreen`
   * list-rendering tests (B-022). */
  addCredentialFor(
    userId: string,
    credential: Omit<Credential, 'id' | 'createdAt' | 'lastUsedAt' | '$typeName' | '$unknown'> & {
      id?: string;
      createdAt?: Date;
    },
  ): Credential {
    const full: Credential = {
      $typeName: 'patches.v1.Credential',
      id: credential.id ?? randomUUID(),
      type: credential.type,
      label: credential.label,
      identifier: credential.identifier,
      createdAt: fromDate(credential.createdAt ?? new Date()),
      lastUsedAt: undefined,
    };
    this.credentialsFor(userId).push(full);
    return full;
  }

  private credentialsFor(userId: string): Credential[] {
    let list = this.credentialsByUser.get(userId);
    if (list === undefined) {
      list = [];
      this.credentialsByUser.set(userId, list);
    }
    return list;
  }

  private toActor(user: FakeUser): Actor {
    const postCount = this.posts.filter((post) => post.author?.id === user.id).length;
    const followingCount = this.follows.get(user.id)?.size ?? 0;
    const followerCount = [...this.follows.values()].filter((following) =>
      following.has(user.id),
    ).length;
    return {
      $typeName: 'patches.v1.Actor',
      id: user.id,
      handle: user.handle,
      displayName: user.displayName,
      bio: user.bio,
      locationText: user.locationText ?? '',
      websiteUrl: user.websiteUrl ?? '',
      avatar: undefined,
      isLocal: true,
      joinedAt: fromDate(new Date('2026-01-01T00:00:00.000Z')),
      counts: {
        $typeName: 'patches.v1.ActorCounts',
        followers: followerCount,
        following: followingCount,
        posts: postCount,
      },
      nameplate: user.nameplate,
      // Amendment B fields (P11-001) — no fake-api writer produces flair/pinned posts yet.
      flair: undefined,
      pinnedPostIds: [],
    };
  }

  private buildPost(
    id: string,
    authorId: string,
    body: string,
    createdAt: Date,
    inReplyToId = '',
    media: readonly MediaAttachment[] = [],
  ): Post {
    const user = this.users.get(authorId);
    if (user === undefined) throw new Error(`fake api: no such user ${authorId}`);
    const parent = inReplyToId === '' ? undefined : this.posts.find((p) => p.id === inReplyToId);
    if (inReplyToId !== '' && parent === undefined) {
      throw new Error(`fake api: no such post ${inReplyToId}`);
    }
    return {
      $typeName: 'patches.v1.Post',
      id,
      author: this.toActor(user),
      body,
      postType: POST_TYPE.NOTE,
      linkUrl: '',
      visibility: POST_VISIBILITY.PUBLIC,
      inReplyToId,
      rootPostId: parent?.rootPostId ?? id,
      media: [...media],
      createdAt: fromDate(createdAt),
      editedAt: undefined,
      deleted: false,
      counts: { $typeName: 'patches.v1.PostCounts', replies: 0, likes: 0, reposts: 0, quotes: 0 },
      viewerState: {
        $typeName: 'patches.v1.PostViewerState',
        liked: false,
        bookmarked: false,
        reposted: false,
      },
      contentWarning: '',
      // Amendment B fields (P11-001) — fake-api has no repost/quote/community writer yet.
      quotedPost: undefined,
      community: undefined,
      quotePolicy: QUOTE_POLICY.UNSPECIFIED,
      repostedBy: [],
      repostedByTotal: 0,
      filteredBy: undefined,
      labels: [],
    };
  }

  private issueSession(user: FakeUser): Session {
    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    const fakeSession: FakeSession = { accessToken, refreshToken, userId: user.id };
    this.sessions.set(accessToken, fakeSession);
    this.refreshTokens.set(refreshToken, fakeSession);
    const now = Date.now();
    return {
      $typeName: 'patches.v1.Session',
      actor: this.toActor(user),
      accessToken,
      accessExpiresAt: fromDate(new Date(now + 15 * 60 * 1000)),
      refreshToken,
      refreshExpiresAt: fromDate(new Date(now + 30 * 24 * 60 * 60 * 1000)),
      emailVerified: user.emailVerified ?? true,
      node: this.target,
    };
  }

  private register(request: RegisterRequest): Promise<RegisterResponse> {
    if ([...this.users.values()].some((user) => user.handle === request.handle)) {
      return Promise.reject(grpcError(GrpcStatus.ALREADY_EXISTS, 'That handle is taken.'));
    }
    const user = this.addUser({
      handle: request.handle,
      password: request.password,
      displayName: request.displayName,
      bio: '',
    });
    return Promise.resolve({
      $typeName: 'patches.v1.RegisterResponse',
      session: this.issueSession(user),
    });
  }

  private login(request: LoginRequest): Promise<LoginResponse> {
    const user = [...this.users.values()].find(
      (candidate) => candidate.handle === request.emailOrHandle,
    );
    if (user === undefined || user.password !== request.password) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'wrong credentials'));
    }
    return Promise.resolve({
      $typeName: 'patches.v1.LoginResponse',
      session: this.issueSession(user),
    });
  }

  private refreshSession(request: RefreshSessionRequest): Promise<RefreshSessionResponse> {
    const found = this.refreshTokens.get(request.refreshToken);
    const user = found === undefined ? undefined : this.users.get(found.userId);
    if (found === undefined || user === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'refresh token unknown'));
    }
    this.sessions.delete(found.accessToken);
    this.refreshTokens.delete(request.refreshToken);
    return Promise.resolve({
      $typeName: 'patches.v1.RefreshSessionResponse',
      session: this.issueSession(user),
    });
  }

  private requireSession(accessToken: string): FakeSession | undefined {
    return this.sessions.get(accessToken);
  }

  // ---- Email verification (A-028, spec §37/§165) ----

  /** Unauthenticated — matches `code` against whichever user's `verificationCode`
   * was seeded with it (`addUser({ ..., verificationCode: '123456' })`), same as the
   * real server has no session to key off yet either. */
  private verifyEmail(request: VerifyEmailRequest): Promise<VerifyEmailResponse> {
    const user = [...this.users.values()].find(
      (candidate) =>
        candidate.verificationCode !== undefined && candidate.verificationCode === request.code,
    );
    if (user === undefined) {
      return Promise.reject(grpcError(GrpcStatus.INVALID_ARGUMENT, 'That code is invalid.'));
    }
    user.emailVerified = true;
    return Promise.resolve({ $typeName: 'patches.v1.VerifyEmailResponse', emailVerified: true });
  }

  private resendVerification(accessToken: string): Promise<ResendVerificationResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    this.resendVerificationCalls.push(session.userId);
    return Promise.resolve({ $typeName: 'patches.v1.ResendVerificationResponse' });
  }

  private getActor(request: GetActorRequest): Promise<GetActorResponse> {
    const user = this.users.get(request.id);
    if (user === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That no longer exists.'));
    }
    return Promise.resolve({ $typeName: 'patches.v1.GetActorResponse', actor: this.toActor(user) });
  }

  private getActorByHandle(request: GetActorByHandleRequest): Promise<GetActorByHandleResponse> {
    const user = [...this.users.values()].find((candidate) => candidate.handle === request.handle);
    if (user === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That no longer exists.'));
    }
    return Promise.resolve({
      $typeName: 'patches.v1.GetActorByHandleResponse',
      actor: this.toActor(user),
    });
  }

  /** Applies only the fields named in `updateMask` (spec: `actors.proto`'s
   * `UpdateProfileRequest` — field names, snake_case, e.g. `'display_name'`), same
   * contract as the real `ActorService.UpdateProfile` (`apps/server/.../actor.service.ts`). */
  private updateProfile(
    request: UpdateProfileRequest,
    accessToken: string,
  ): Promise<UpdateProfileResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const user = this.users.get(session.userId);
    if (user === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const mask = new Set(request.updateMask?.paths ?? []);
    if (mask.has('display_name')) user.displayName = request.displayName;
    if (mask.has('bio')) user.bio = request.bio;
    if (mask.has('location_text')) user.locationText = request.locationText;
    if (mask.has('website_url')) user.websiteUrl = request.websiteUrl;
    if (mask.has('nameplate') && request.nameplate !== undefined) {
      user.nameplate = request.nameplate;
    }
    return Promise.resolve({
      $typeName: 'patches.v1.UpdateProfileResponse',
      actor: this.toActor(user),
    });
  }

  /** `acct` must not be `localDomain` — mirrors the real `ActorService.resolveActor`'s
   * "local domain → validation error" rule (B-028). */
  private resolveActor(
    request: ResolveActorRequest,
    accessToken: string,
  ): Promise<ResolveActorResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    if (!this.federationEnabled) {
      return Promise.reject(
        grpcError(GrpcStatus.UNIMPLEMENTED, 'federation is disabled on this node'),
      );
    }
    const domain = request.acct.split('@')[1];
    if (domain === undefined || domain === '') {
      return Promise.reject(grpcError(GrpcStatus.INVALID_ARGUMENT, 'acct must be user@domain'));
    }
    if (domain === this.localDomain) {
      return Promise.reject(
        grpcError(GrpcStatus.INVALID_ARGUMENT, 'acct must be on a remote domain'),
      );
    }
    const actor = this.remoteActors.get(request.acct);
    if (actor === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That account could not be resolved.'));
    }
    return Promise.resolve({ $typeName: 'patches.v1.ResolveActorResponse', actor });
  }

  /** Cursor pagination shared by every `ListXxx`/`SearchActors` RPC below. */
  private paginate<T>(
    all: readonly T[],
    cursor: string,
    limit: number,
  ): { items: T[]; page: PageInfo } {
    const start = cursor === '' ? 0 : Number(cursor);
    // `pageSize` is a hard cap, not just a fallback for `limit <= 0` — real screens
    // always pass a concrete `limit` (e.g. 20), so a small `fakeOptions.pageSize`
    // must still win to let pagination tests exercise "load more" without seeding
    // hundreds of posts/actors (see the `FakeApiOptions.pageSize` doc comment above).
    const requested = limit > 0 ? limit : this.pageSize;
    const effectiveLimit = Math.min(requested, this.pageSize);
    const page = all.slice(start, start + effectiveLimit);
    const next = start + page.length;
    return {
      items: page,
      page: {
        $typeName: 'patches.v1.PageInfo',
        nextCursor: next < all.length ? String(next) : '',
        hasMore: next < all.length,
      },
    };
  }

  /** Live `counts.replies` at read time — mirrors the real server (spec §51's `PostCounts`
   * reflects current direct replies, not a value frozen at creation). */
  private withFreshCounts(post: Post): Post {
    const replies = this.posts.filter((p) => p.inReplyToId === post.id && !p.deleted).length;
    return {
      ...post,
      counts: {
        $typeName: 'patches.v1.PostCounts',
        likes: post.counts?.likes ?? 0,
        replies,
        reposts: post.counts?.reposts ?? 0,
        quotes: post.counts?.quotes ?? 0,
      },
    };
  }

  private listActorPosts(request: ListActorPostsRequest): Promise<ListActorPostsResponse> {
    const forActor = this.posts.filter((post) => post.author?.id === request.actorId);
    const { items, page } = this.paginate(forActor, request.cursor, request.limit);
    return Promise.resolve({
      $typeName: 'patches.v1.ListActorPostsResponse',
      posts: items.map((post) => this.withFreshCounts(post)),
      page,
    });
  }

  private listLocalFeed(request: ListLocalFeedRequest): Promise<ListLocalFeedResponse> {
    const { items, page } = this.paginate(this.posts, request.cursor, request.limit);
    return Promise.resolve({
      $typeName: 'patches.v1.ListLocalFeedResponse',
      posts: items.map((post) => this.withFreshCounts(post)),
      page,
    });
  }

  /** The caller's own posts plus posts from actors they follow (spec §52, §137). */
  private listHomeFeed(
    request: ListHomeFeedRequest,
    accessToken: string,
  ): Promise<ListHomeFeedResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const following = this.follows.get(session.userId) ?? new Set<string>();
    const relevant = this.posts.filter(
      (post) => post.author?.id === session.userId || following.has(post.author?.id ?? ''),
    );
    const { items, page } = this.paginate(relevant, request.cursor, request.limit);
    return Promise.resolve({
      $typeName: 'patches.v1.ListHomeFeedResponse',
      posts: items.map((post) => this.withFreshCounts(post)),
      page,
    });
  }

  private getPost(request: GetPostRequest): Promise<GetPostResponse> {
    const post = this.posts.find((candidate) => candidate.id === request.id);
    if (post === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That post no longer exists.'));
    }
    return Promise.resolve({
      $typeName: 'patches.v1.GetPostResponse',
      post: this.withFreshCounts(post),
    });
  }

  /** Direct replies only, newest first — mirrors `PostService.listReplies` (see
   * `apps/server/src/modules/posts/post.service.ts`): one level deep, `max_depth`
   * accepted but not honoured. */
  private listReplies(request: ListRepliesRequest): Promise<ListRepliesResponse> {
    const direct = this.posts.filter((post) => post.inReplyToId === request.postId);
    const { items, page } = this.paginate(direct, request.cursor, request.limit);
    return Promise.resolve({
      $typeName: 'patches.v1.ListRepliesResponse',
      posts: items.map((post) => this.withFreshCounts(post)),
      page,
    });
  }

  /** Handle-prefix + display-name substring match (spec §112) — no ranking, insertion order. */
  private searchActors(request: SearchActorsRequest): Promise<SearchActorsResponse> {
    const query = request.query.trim().toLowerCase();
    const matches =
      query === ''
        ? []
        : [...this.users.values()].filter(
            (user) =>
              user.handle.toLowerCase().startsWith(query) ||
              user.displayName.toLowerCase().includes(query),
          );
    const { items, page } = this.paginate(matches, request.cursor, request.limit);
    return Promise.resolve({
      $typeName: 'patches.v1.SearchActorsResponse',
      actors: items.map((user) => this.toActor(user)),
      page,
    });
  }

  private relationship(callerId: string, targetId: string): Relationship {
    return {
      $typeName: 'patches.v1.Relationship',
      state:
        (this.follows.get(callerId)?.has(targetId) ?? false)
          ? FOLLOW_STATE.FOLLOWING
          : FOLLOW_STATE.NONE,
      followedBy: this.follows.get(targetId)?.has(callerId) ?? false,
      blocking: this.blocks.get(callerId)?.has(targetId) ?? false,
      muting: this.mutes.get(callerId)?.has(targetId) ?? false,
      // §197.5 locked-account follow requests: this fixture has no locked-account
      // simulation, so every follow is immediate and neither field is ever true.
      requested: false,
      requestedBy: false,
    };
  }

  private followActor(
    request: FollowActorRequest,
    accessToken: string,
  ): Promise<FollowActorResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const following = this.follows.get(session.userId) ?? new Set<string>();
    following.add(request.actorId);
    this.follows.set(session.userId, following);
    return Promise.resolve({
      $typeName: 'patches.v1.FollowActorResponse',
      relationship: this.relationship(session.userId, request.actorId),
      requested: false,
    });
  }

  private unfollowActor(
    request: UnfollowActorRequest,
    accessToken: string,
  ): Promise<UnfollowActorResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    this.follows.get(session.userId)?.delete(request.actorId);
    return Promise.resolve({
      $typeName: 'patches.v1.UnfollowActorResponse',
      relationship: this.relationship(session.userId, request.actorId),
    });
  }

  private getRelationship(
    request: GetRelationshipRequest,
    accessToken: string,
  ): Promise<GetRelationshipResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    return Promise.resolve({
      $typeName: 'patches.v1.GetRelationshipResponse',
      relationship: this.relationship(session.userId, request.actorId),
    });
  }

  /** Actors `actorId` follows who follow back — a public read, `accessToken` unused
   * (B-024's `Friends` page block). */
  private listMutualFollows(
    request: ListMutualFollowsRequest,
    _accessToken?: string,
  ): Promise<ListMutualFollowsResponse> {
    const following = this.follows.get(request.actorId) ?? new Set<string>();
    const mutualIds = [...following].filter(
      (id) => this.follows.get(id)?.has(request.actorId) ?? false,
    );
    const mutualUsers = mutualIds
      .map((id) => this.users.get(id))
      .filter((user): user is FakeUser => user !== undefined);
    const { items, page } = this.paginate(mutualUsers, request.cursor, request.limit);
    return Promise.resolve({
      $typeName: 'patches.v1.ListMutualFollowsResponse',
      actors: items.map((user) => this.toActor(user)),
      page,
    });
  }

  private createPost(request: CreatePostRequest, accessToken: string): Promise<CreatePostResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    if (request.inReplyToId !== '' && !this.posts.some((p) => p.id === request.inReplyToId)) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That post no longer exists.'));
    }
    const media = request.mediaIds
      .map((mediaId, position) => this.toMediaAttachment(mediaId, position))
      .filter((attachment): attachment is MediaAttachment => attachment !== undefined);
    const post = this.buildPost(
      randomUUID(),
      session.userId,
      request.body,
      new Date(),
      request.inReplyToId,
      media,
    );
    this.posts.unshift(post);
    return Promise.resolve({
      $typeName: 'patches.v1.CreatePostResponse',
      post: this.withFreshCounts(post),
    });
  }

  /** Only `READY` media ids resolve to an attachment (mirrors the real server rejecting
   * a `CreatePost` referencing a not-yet-`READY`/unknown media id — the fake just drops
   * it here rather than erroring, since `ComposeScreen` already never submits one). */
  private toMediaAttachment(mediaId: string, position: number): MediaAttachment | undefined {
    const media = this.media.get(mediaId);
    if (media === undefined || media.status !== MEDIA_STATUS.READY) return undefined;
    return {
      $typeName: 'patches.v1.MediaAttachment',
      mediaId,
      altText: '',
      width: 100,
      height: 100,
      mimeType: media.mimeType,
      position,
    };
  }

  private findPost(id: string): Post | undefined {
    return this.posts.find((candidate) => candidate.id === id);
  }

  /** Test-only lookup — asserts on what `CreatePost` actually stored (e.g. its
   * `media`) without the caller needing the post id back from a screen. */
  findPostByBody(body: string): Post | undefined {
    return this.posts.find((candidate) => candidate.body === body);
  }

  // ---- ReactionService (spec §53) ----

  private likePost(request: LikePostRequest, accessToken: string): Promise<LikePostResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    if (this.findPost(request.postId) === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That post no longer exists.'));
    }
    const likers = this.likes.get(request.postId) ?? new Set<string>();
    likers.add(session.userId);
    this.likes.set(request.postId, likers);
    return Promise.resolve({
      $typeName: 'patches.v1.LikePostResponse',
      counts: {
        $typeName: 'patches.v1.PostCounts',
        replies: 0,
        likes: likers.size,
        reposts: 0,
        quotes: 0,
      },
      viewerState: {
        $typeName: 'patches.v1.PostViewerState',
        liked: true,
        bookmarked: this.isBookmarked(session.userId, request.postId),
        reposted: false,
      },
    });
  }

  private unlikePost(request: UnlikePostRequest, accessToken: string): Promise<UnlikePostResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    this.likes.get(request.postId)?.delete(session.userId);
    return Promise.resolve({
      $typeName: 'patches.v1.UnlikePostResponse',
      counts: {
        $typeName: 'patches.v1.PostCounts',
        replies: 0,
        likes: this.likes.get(request.postId)?.size ?? 0,
        reposts: 0,
        quotes: 0,
      },
      viewerState: {
        $typeName: 'patches.v1.PostViewerState',
        liked: false,
        bookmarked: this.isBookmarked(session.userId, request.postId),
        reposted: false,
      },
    });
  }

  private isBookmarked(userId: string, postId: string): boolean {
    return this.bookmarks.get(userId)?.includes(postId) ?? false;
  }

  private bookmarkPost(
    request: BookmarkPostRequest,
    accessToken: string,
  ): Promise<BookmarkPostResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    if (this.findPost(request.postId) === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That post no longer exists.'));
    }
    const mine = this.bookmarks.get(session.userId) ?? [];
    if (!mine.includes(request.postId)) mine.unshift(request.postId);
    this.bookmarks.set(session.userId, mine);
    return Promise.resolve({
      $typeName: 'patches.v1.BookmarkPostResponse',
      viewerState: {
        $typeName: 'patches.v1.PostViewerState',
        liked: this.likes.get(request.postId)?.has(session.userId) ?? false,
        bookmarked: true,
        reposted: false,
      },
    });
  }

  private unbookmarkPost(
    request: UnbookmarkPostRequest,
    accessToken: string,
  ): Promise<UnbookmarkPostResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const mine = this.bookmarks.get(session.userId) ?? [];
    this.bookmarks.set(
      session.userId,
      mine.filter((id) => id !== request.postId),
    );
    return Promise.resolve({
      $typeName: 'patches.v1.UnbookmarkPostResponse',
      viewerState: {
        $typeName: 'patches.v1.PostViewerState',
        liked: this.likes.get(request.postId)?.has(session.userId) ?? false,
        bookmarked: false,
        reposted: false,
      },
    });
  }

  /** Private — never another actor's (spec §53). */
  private listBookmarks(
    request: ListBookmarksRequest,
    accessToken: string,
  ): Promise<ListBookmarksResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const ids = this.bookmarks.get(session.userId) ?? [];
    const bookmarked = ids
      .map((id) => this.findPost(id))
      .filter((post): post is Post => post !== undefined)
      .map((post) => ({
        ...this.withFreshCounts(post),
        viewerState: {
          $typeName: 'patches.v1.PostViewerState' as const,
          liked: this.likes.get(post.id)?.has(session.userId) ?? false,
          bookmarked: true,
          reposted: false,
        },
      }));
    const { items, page } = this.paginate(bookmarked, request.cursor, request.limit);
    return Promise.resolve({ $typeName: 'patches.v1.ListBookmarksResponse', posts: items, page });
  }

  private listPostLikers(request: ListPostLikersRequest): Promise<ListPostLikersResponse> {
    const likerIds = [...(this.likes.get(request.postId) ?? new Set<string>())];
    const actors = likerIds
      .map((id) => this.users.get(id))
      .filter((user): user is FakeUser => user !== undefined)
      .map((user) => this.toActor(user));
    const { items, page } = this.paginate(actors, request.cursor, request.limit);
    return Promise.resolve({
      $typeName: 'patches.v1.ListPostLikersResponse',
      actors: items,
      page,
    });
  }

  // ---- NotificationService (spec §56, §113) ----

  private listNotifications(
    request: ListNotificationsRequest,
    accessToken: string,
  ): Promise<ListNotificationsResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const { items, page } = this.paginate(
      this.notificationsFor(session.userId),
      request.cursor,
      request.limit,
    );
    return Promise.resolve({
      $typeName: 'patches.v1.ListNotificationsResponse',
      notifications: items,
      page,
    });
  }

  private markNotificationsRead(
    request: MarkNotificationsReadRequest,
    accessToken: string,
  ): Promise<MarkNotificationsReadResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const mine = this.notificationsFor(session.userId);
    const now = fromDate(new Date());
    let markedCount = 0;
    // `through_id` means "everything down to and including this one" in the
    // newest-first list, not "only this one" — the screen marks what has been on
    // screen by naming the last visible notification.
    const through = request.markAll
      ? mine.length - 1
      : mine.findIndex((n) => n.id === request.throughId);
    for (const notification of mine.slice(0, through + 1)) {
      if (notification.readAt !== undefined) continue;
      notification.readAt = now;
      markedCount += 1;
    }
    return Promise.resolve({
      $typeName: 'patches.v1.MarkNotificationsReadResponse',
      markedCount,
    });
  }

  private getUnreadCount(
    _request: GetUnreadCountRequest,
    accessToken: string,
  ): Promise<GetUnreadCountResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const count = this.notificationsFor(session.userId).filter(
      (notification) => notification.readAt === undefined,
    ).length;
    return Promise.resolve({ $typeName: 'patches.v1.GetUnreadCountResponse', count });
  }

  // ---- ModerationService (spec §55, §61–64) ----

  private blockActor(request: BlockActorRequest, accessToken: string): Promise<BlockActorResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const blocked = this.blocks.get(session.userId) ?? new Set<string>();
    blocked.add(request.actorId);
    this.blocks.set(session.userId, blocked);
    // Blocking removes any follow in either direction (spec §62).
    this.follows.get(session.userId)?.delete(request.actorId);
    this.follows.get(request.actorId)?.delete(session.userId);
    return Promise.resolve({
      $typeName: 'patches.v1.BlockActorResponse',
      relationship: this.relationship(session.userId, request.actorId),
    });
  }

  private unblockActor(
    request: UnblockActorRequest,
    accessToken: string,
  ): Promise<UnblockActorResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    this.blocks.get(session.userId)?.delete(request.actorId);
    return Promise.resolve({
      $typeName: 'patches.v1.UnblockActorResponse',
      relationship: this.relationship(session.userId, request.actorId),
    });
  }

  private muteActor(request: MuteActorRequest, accessToken: string): Promise<MuteActorResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const muted = this.mutes.get(session.userId) ?? new Set<string>();
    muted.add(request.actorId);
    this.mutes.set(session.userId, muted);
    return Promise.resolve({
      $typeName: 'patches.v1.MuteActorResponse',
      relationship: this.relationship(session.userId, request.actorId),
    });
  }

  private unmuteActor(
    request: UnmuteActorRequest,
    accessToken: string,
  ): Promise<UnmuteActorResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    this.mutes.get(session.userId)?.delete(request.actorId);
    return Promise.resolve({
      $typeName: 'patches.v1.UnmuteActorResponse',
      relationship: this.relationship(session.userId, request.actorId),
    });
  }

  private listBlocks(request: ListBlocksRequest, accessToken: string): Promise<ListBlocksResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const actors = [...(this.blocks.get(session.userId) ?? new Set<string>())]
      .map((id) => this.users.get(id))
      .filter((user): user is FakeUser => user !== undefined)
      .map((user) => this.toActor(user));
    const { items, page } = this.paginate(actors, request.cursor, request.limit);
    return Promise.resolve({ $typeName: 'patches.v1.ListBlocksResponse', actors: items, page });
  }

  private listMutes(request: ListMutesRequest, accessToken: string): Promise<ListMutesResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const actors = [...(this.mutes.get(session.userId) ?? new Set<string>())]
      .map((id) => this.users.get(id))
      .filter((user): user is FakeUser => user !== undefined)
      .map((user) => this.toActor(user));
    const { items, page } = this.paginate(actors, request.cursor, request.limit);
    return Promise.resolve({ $typeName: 'patches.v1.ListMutesResponse', actors: items, page });
  }

  private reportPost(request: ReportPostRequest, accessToken: string): Promise<ReportPostResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    if (this.findPost(request.postId) === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That post no longer exists.'));
    }
    return Promise.resolve({
      $typeName: 'patches.v1.ReportPostResponse',
      reportId: randomUUID(),
    });
  }

  private reportActor(
    request: ReportActorRequest,
    accessToken: string,
  ): Promise<ReportActorResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    if (this.users.get(request.actorId) === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That actor no longer exists.'));
    }
    return Promise.resolve({
      $typeName: 'patches.v1.ReportActorResponse',
      reportId: randomUUID(),
    });
  }

  // ---- AccountsScreen (B-022): AuthService.ListCredentials/AddCredential ----

  private listCredentials(accessToken: string): Promise<ListCredentialsResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    return Promise.resolve({
      $typeName: 'patches.v1.ListCredentialsResponse',
      credentials: [...this.credentialsFor(session.userId)],
    });
  }

  /** Mirrors `AuthService#revokeCredential`'s last-credential guard (spec §165) — an
   * account must always retain at least one active credential. */
  private revokeCredential(
    request: { id: string },
    accessToken: string,
  ): Promise<Record<string, never>> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const list = this.credentialsFor(session.userId);
    const index = list.findIndex((candidate) => candidate.id === request.id);
    if (index === -1) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'No such credential on this account.'));
    }
    if (list.length <= 1) {
      return Promise.reject(
        grpcError(
          GrpcStatus.INVALID_ARGUMENT,
          'This is your only way to sign in. Add another credential before revoking this one.',
        ),
      );
    }
    list.splice(index, 1);
    return Promise.resolve({});
  }

  private addCredential(
    request: AddCredentialRequest,
    accessToken: string,
  ): Promise<AddCredentialResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const credential = this.addCredentialFor(session.userId, {
      type: request.type,
      label: request.label,
      // The fake never actually parses `secret` — the real server does (spec §165) —
      // it just needs something identifier-shaped for the accounts list to show.
      identifier: request.secret.slice(0, 32),
    });
    return Promise.resolve({ $typeName: 'patches.v1.AddCredentialResponse', credential });
  }

  // ---- MediaService (P5-003/B-004, spec §29–32) ----

  private beginMediaUpload(
    request: BeginMediaUploadRequest,
    accessToken: string,
  ): Promise<BeginMediaUploadResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const mediaId = randomUUID();
    this.media.set(mediaId, {
      mimeType: request.mimeType,
      byteSize: Number(request.byteSize),
      status: MEDIA_STATUS.PENDING,
    });
    return Promise.resolve({
      $typeName: 'patches.v1.BeginMediaUploadResponse',
      mediaId,
      uploadUrl: `${FAKE_UPLOAD_PREFIX}${mediaId}`,
      expiresAt: fromDate(new Date(Date.now() + 60_000)),
    });
  }

  /** No real worker in the fake — flips straight to `READY` (skipping `PROCESSING`),
   * since `pollUntilReady`'s first poll already sees the terminal state. */
  private finalizeMediaUpload(
    request: FinalizeMediaUploadRequest,
    accessToken: string,
  ): Promise<FinalizeMediaUploadResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const media = this.media.get(request.mediaId);
    if (media === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That media no longer exists.'));
    }
    media.status = MEDIA_STATUS.READY;
    return Promise.resolve({
      $typeName: 'patches.v1.FinalizeMediaUploadResponse',
      mediaId: request.mediaId,
      status: media.status,
    });
  }

  private getMediaDownload(
    request: GetMediaDownloadRequest,
    accessToken: string,
  ): Promise<GetMediaDownloadResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const media = this.media.get(request.mediaId);
    if (media === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That media no longer exists.'));
    }
    return Promise.resolve({
      $typeName: 'patches.v1.GetMediaDownloadResponse',
      mediaId: request.mediaId,
      status: media.status,
      mimeType: media.mimeType,
      width: 100,
      height: 100,
      downloadUrl: `${FAKE_DOWNLOAD_PREFIX}${request.mediaId}`,
      thumbnailUrl: `${FAKE_DOWNLOAD_PREFIX}${request.mediaId}`,
      expiresAt: fromDate(new Date(Date.now() + 60_000)),
    });
  }

  /** `globalThis.fetch` override target for a PUT to a `BeginMediaUpload` `uploadUrl`
   * (`apps/tui/src/media/upload.ts`'s `putToPresignedUrl`) — stores the uploaded bytes
   * so a later `GetMediaDownload`/`o` fetch has something real to read back. */
  async handleFakeUpload(url: string, init: RequestInit | undefined): Promise<Response> {
    const mediaId = url.slice(FAKE_UPLOAD_PREFIX.length);
    const media = this.media.get(mediaId);
    if (media === undefined) return new Response(null, { status: 404 });
    const bytes = await readRequestBody(init?.body);
    media.bytes = bytes;
    media.byteSize = bytes.byteLength;
    return new Response(null, { status: 200 });
  }

  /** `globalThis.fetch` override target for a `GetMediaDownload` `download_url`/
   * `thumbnail_url` (both point here in the fake — see `getMediaDownload` above). */
  handleFakeDownload(url: string): Response {
    const mediaId = url.slice(FAKE_DOWNLOAD_PREFIX.length);
    const media = this.media.get(mediaId);
    if (media?.bytes === undefined) return new Response(null, { status: 404 });
    return new Response(media.bytes, {
      status: 200,
      headers: { 'Content-Type': media.mimeType },
    });
  }

  // ---- PageService (P45-004..007, spec §170–172) ----

  private getPage(request: GetPageRequest): Promise<GetPageResponse> {
    const user = [...this.users.values()].find((candidate) => candidate.handle === request.handle);
    if (user === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That page no longer exists.'));
    }
    const activeSlug = request.slug === '' ? 'index' : request.slug;
    const found = this.pages.get(pageKey(request.handle, activeSlug));
    const document = found?.document ?? emptyPageDocument(activeSlug);
    return Promise.resolve({
      $typeName: 'patches.v1.GetPageResponse',
      ownerActorId: user.id,
      revisionId: found?.revisionId ?? '',
      document: Buffer.from(JSON.stringify(document), 'utf8'),
      activeSlug,
      theme: {
        $typeName: 'patches.v1.PageTheme',
        accent: document.theme?.accent ?? '',
        background: document.theme?.background ?? '',
        foreground: document.theme?.foreground ?? '',
        border: document.theme?.border ?? '',
        avatarStyle: document.theme?.avatarStyle ?? '',
      },
      updatedAt: fromDate(found?.updatedAt ?? new Date()),
    });
  }

  private updatePage(request: UpdatePageRequest, accessToken: string): Promise<UpdatePageResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const user = this.users.get(session.userId);
    if (user === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    let parsed: PatchesPage;
    try {
      const raw: unknown = JSON.parse(new TextDecoder().decode(request.document));
      parsed = parsePageStrict(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid page document.';
      return Promise.reject(grpcError(GrpcStatus.INVALID_ARGUMENT, message));
    }
    const updatedAt = new Date();
    const revisionId = randomUUID();
    for (const subPage of parsed.pages) {
      this.pages.set(pageKey(user.handle, subPage.slug), {
        document: parsed,
        revisionId,
        updatedAt,
      });
    }
    return Promise.resolve({
      $typeName: 'patches.v1.UpdatePageResponse',
      revisionId,
      document: Buffer.from(JSON.stringify(parsed), 'utf8'),
      updatedAt: fromDate(updatedAt),
    });
  }

  private listGuestbook(request: ListGuestbookRequest): Promise<ListGuestbookResponse> {
    const activeSlug = request.slug === '' ? 'index' : request.slug;
    const entries = this.guestbook.get(pageKey(request.handle, activeSlug)) ?? [];
    const { items, page } = this.paginate(entries, request.cursor, request.limit);
    return Promise.resolve({
      $typeName: 'patches.v1.ListGuestbookResponse',
      entries: items,
      page,
    });
  }

  private signGuestbook(
    request: SignGuestbookRequest,
    accessToken: string,
  ): Promise<SignGuestbookResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const entry = this.addGuestbookEntry(
      request.handle,
      request.slug,
      session.userId,
      request.body,
    );
    return Promise.resolve({ $typeName: 'patches.v1.SignGuestbookResponse', entry });
  }
}

/** `(handle, slug)` -> the map key `pages`/`guestbook` share, "index" for an empty slug. */
function pageKey(handle: string, slug: string): string {
  return `${handle}/${slug === '' ? 'index' : slug}`;
}

/** What `GetPage` returns for a handle with no page ever written — a single empty
 * index page, same as a freshly-registered actor's default document. */
function emptyPageDocument(slug: string): PatchesPage {
  return { version: 1, pages: [{ slug, title: '', blocks: [] }] };
}

export function createFakeApi(options: FakeApiOptions = {}): FakeApiHandle {
  return new FakeApiHandle(options);
}
