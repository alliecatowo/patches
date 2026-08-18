import { randomUUID } from 'node:crypto';

import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  dateToTimestamp,
  FOLLOW_STATE,
  POST_TYPE,
  POST_VISIBILITY,
  type Actor,
  type BlockActorRequest,
  type BlockActorResponse,
  type BookmarkPostRequest,
  type BookmarkPostResponse,
  type CreatePostRequest,
  type CreatePostResponse,
  type FollowActorRequest,
  type FollowActorResponse,
  type GetActorByHandleRequest,
  type GetActorByHandleResponse,
  type GetActorRequest,
  type GetActorResponse,
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
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type ListMutesRequest,
  type ListMutesResponse,
  type ListNotificationsRequest,
  type ListNotificationsResponse,
  type ListPostLikersRequest,
  type ListPostLikersResponse,
  type ListRepliesRequest,
  type ListRepliesResponse,
  type LoginRequest,
  type LoginResponse,
  type MarkNotificationsReadRequest,
  type MarkNotificationsReadResponse,
  type MuteActorRequest,
  type MuteActorResponse,
  type Notification,
  type NotificationType,
  type PageInfo,
  type Post,
  type RefreshSessionRequest,
  type RefreshSessionResponse,
  type RegisterRequest,
  type RegisterResponse,
  type Relationship,
  type ReportActorRequest,
  type ReportActorResponse,
  type ReportPostRequest,
  type ReportPostResponse,
  type SearchActorsRequest,
  type SearchActorsResponse,
  type Session,
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
} from '@patches/proto';

import type { PatchesApi } from '../src/api/client.js';

/** A seeded local account the fake server knows about. */
export interface FakeUser {
  id: string;
  handle: string;
  password: string;
  displayName: string;
  bio: string;
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
  private readonly pageSize: number;
  private readonly serverInfo: GetServerInfoResponse;

  constructor(options: FakeApiOptions = {}) {
    this.target = options.target ?? 'patches.test:50051';
    this.pageSize = options.pageSize ?? 20;
    this.serverInfo = {
      serverVersion: '0.1.0',
      protocolVersion: 1,
      minClientVersion: '0.1.0',
      serverTime: dateToTimestamp(new Date('2026-08-17T21:00:00.000Z')),
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
      ping: (nonce: string) => Promise.resolve({ nonce, serverTime: dateToTimestamp(new Date()) }),
      register: (request: RegisterRequest) => this.register(request),
      login: (request: LoginRequest) => this.login(request),
      refreshSession: (request: RefreshSessionRequest) => this.refreshSession(request),
      logout: () => Promise.resolve({}),
      beginSshLogin: () =>
        Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: no ssh agent')),
      completeSshLogin: () =>
        Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: no ssh agent')),
      getCurrentSession: () =>
        Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: not needed by the tests')),
      logoutAllSessions: () => Promise.resolve({}),
      listCredentials: () => Promise.resolve({ credentials: [] }),
      getActor: (request: GetActorRequest) => this.getActor(request),
      getActorByHandle: (request: GetActorByHandleRequest) => this.getActorByHandle(request),
      searchActors: (request: SearchActorsRequest) => this.searchActors(request),
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
      addCredential: () =>
        Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: not needed by the tests')),
      revokeCredential: () =>
        Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: not needed by the tests')),
      getNodeInfo: () =>
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
      close: () => undefined,
    } as unknown as PatchesApi;
  }

  /** Registers a local account the fake server will accept `Login` for. */
  addUser(user: Omit<FakeUser, 'id'> & { id?: string }): FakeUser {
    const full: FakeUser = { id: user.id ?? randomUUID(), ...user };
    this.users.set(full.id, full);
    return full;
  }

  /** Seeds a post directly (bypassing `CreatePost`), newest-first like the real feed.
   * Pass `inReplyToId` to seed a reply (P4-004's thread-screen tests). */
  addPost(authorId: string, body: string, createdAt: Date = new Date(), inReplyToId = ''): Post {
    const post = this.buildPost(randomUUID(), authorId, body, createdAt, inReplyToId);
    this.posts.unshift(post);
    return post;
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
      id: randomUUID(),
      type,
      actor: actorUser === undefined ? undefined : this.toActor(actorUser),
      postId: options.postId ?? '',
      createdAt: dateToTimestamp(createdAt),
      readAt: options.read === true ? dateToTimestamp(createdAt) : undefined,
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

  private toActor(user: FakeUser): Actor {
    const postCount = this.posts.filter((post) => post.author?.id === user.id).length;
    const followingCount = this.follows.get(user.id)?.size ?? 0;
    const followerCount = [...this.follows.values()].filter((following) =>
      following.has(user.id),
    ).length;
    return {
      id: user.id,
      handle: user.handle,
      displayName: user.displayName,
      bio: user.bio,
      locationText: '',
      websiteUrl: '',
      avatar: undefined,
      isLocal: true,
      joinedAt: dateToTimestamp(new Date('2026-01-01T00:00:00.000Z')),
      counts: { followers: followerCount, following: followingCount, posts: postCount },
      nameplate: undefined,
    };
  }

  private buildPost(
    id: string,
    authorId: string,
    body: string,
    createdAt: Date,
    inReplyToId = '',
  ): Post {
    const user = this.users.get(authorId);
    if (user === undefined) throw new Error(`fake api: no such user ${authorId}`);
    const parent = inReplyToId === '' ? undefined : this.posts.find((p) => p.id === inReplyToId);
    if (inReplyToId !== '' && parent === undefined) {
      throw new Error(`fake api: no such post ${inReplyToId}`);
    }
    return {
      id,
      author: this.toActor(user),
      body,
      postType: POST_TYPE.NOTE,
      linkUrl: '',
      visibility: POST_VISIBILITY.PUBLIC,
      inReplyToId,
      rootPostId: parent?.rootPostId ?? id,
      media: [],
      createdAt: dateToTimestamp(createdAt),
      editedAt: undefined,
      deleted: false,
      counts: { replies: 0, likes: 0 },
      viewerState: { liked: false, bookmarked: false },
      contentWarning: '',
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
      actor: this.toActor(user),
      accessToken,
      accessExpiresAt: dateToTimestamp(new Date(now + 15 * 60 * 1000)),
      refreshToken,
      refreshExpiresAt: dateToTimestamp(new Date(now + 30 * 24 * 60 * 60 * 1000)),
      emailVerified: true,
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
    return Promise.resolve({ session: this.issueSession(user) });
  }

  private login(request: LoginRequest): Promise<LoginResponse> {
    const user = [...this.users.values()].find(
      (candidate) => candidate.handle === request.emailOrHandle,
    );
    if (user === undefined || user.password !== request.password) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'wrong credentials'));
    }
    return Promise.resolve({ session: this.issueSession(user) });
  }

  private refreshSession(request: RefreshSessionRequest): Promise<RefreshSessionResponse> {
    const found = this.refreshTokens.get(request.refreshToken);
    const user = found === undefined ? undefined : this.users.get(found.userId);
    if (found === undefined || user === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'refresh token unknown'));
    }
    this.sessions.delete(found.accessToken);
    this.refreshTokens.delete(request.refreshToken);
    return Promise.resolve({ session: this.issueSession(user) });
  }

  private requireSession(accessToken: string): FakeSession | undefined {
    return this.sessions.get(accessToken);
  }

  private getActor(request: GetActorRequest): Promise<GetActorResponse> {
    const user = this.users.get(request.id);
    if (user === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That no longer exists.'));
    }
    return Promise.resolve({ actor: this.toActor(user) });
  }

  private getActorByHandle(request: GetActorByHandleRequest): Promise<GetActorByHandleResponse> {
    const user = [...this.users.values()].find((candidate) => candidate.handle === request.handle);
    if (user === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That no longer exists.'));
    }
    return Promise.resolve({ actor: this.toActor(user) });
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
      page: { nextCursor: next < all.length ? String(next) : '', hasMore: next < all.length },
    };
  }

  /** Live `counts.replies` at read time — mirrors the real server (spec §51's `PostCounts`
   * reflects current direct replies, not a value frozen at creation). */
  private withFreshCounts(post: Post): Post {
    const replies = this.posts.filter((p) => p.inReplyToId === post.id && !p.deleted).length;
    return { ...post, counts: { likes: post.counts?.likes ?? 0, replies } };
  }

  private listActorPosts(request: ListActorPostsRequest): Promise<ListActorPostsResponse> {
    const forActor = this.posts.filter((post) => post.author?.id === request.actorId);
    const { items, page } = this.paginate(forActor, request.cursor, request.limit);
    return Promise.resolve({ posts: items.map((post) => this.withFreshCounts(post)), page });
  }

  private listLocalFeed(request: ListLocalFeedRequest): Promise<ListLocalFeedResponse> {
    const { items, page } = this.paginate(this.posts, request.cursor, request.limit);
    return Promise.resolve({ posts: items.map((post) => this.withFreshCounts(post)), page });
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
    return Promise.resolve({ posts: items.map((post) => this.withFreshCounts(post)), page });
  }

  private getPost(request: GetPostRequest): Promise<GetPostResponse> {
    const post = this.posts.find((candidate) => candidate.id === request.id);
    if (post === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That post no longer exists.'));
    }
    return Promise.resolve({ post: this.withFreshCounts(post) });
  }

  /** Direct replies only, newest first — mirrors `PostService.listReplies` (see
   * `apps/server/src/modules/posts/post.service.ts`): one level deep, `max_depth`
   * accepted but not honoured. */
  private listReplies(request: ListRepliesRequest): Promise<ListRepliesResponse> {
    const direct = this.posts.filter((post) => post.inReplyToId === request.postId);
    const { items, page } = this.paginate(direct, request.cursor, request.limit);
    return Promise.resolve({ posts: items.map((post) => this.withFreshCounts(post)), page });
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
    return Promise.resolve({ actors: items.map((user) => this.toActor(user)), page });
  }

  private relationship(callerId: string, targetId: string): Relationship {
    return {
      state:
        (this.follows.get(callerId)?.has(targetId) ?? false)
          ? FOLLOW_STATE.FOLLOWING
          : FOLLOW_STATE.NONE,
      followedBy: this.follows.get(targetId)?.has(callerId) ?? false,
      blocking: this.blocks.get(callerId)?.has(targetId) ?? false,
      muting: this.mutes.get(callerId)?.has(targetId) ?? false,
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
    return Promise.resolve({ relationship: this.relationship(session.userId, request.actorId) });
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
    return Promise.resolve({ relationship: this.relationship(session.userId, request.actorId) });
  }

  private getRelationship(
    request: GetRelationshipRequest,
    accessToken: string,
  ): Promise<GetRelationshipResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    return Promise.resolve({ relationship: this.relationship(session.userId, request.actorId) });
  }

  private createPost(request: CreatePostRequest, accessToken: string): Promise<CreatePostResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    if (request.inReplyToId !== '' && !this.posts.some((p) => p.id === request.inReplyToId)) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That post no longer exists.'));
    }
    const post = this.buildPost(
      randomUUID(),
      session.userId,
      request.body,
      new Date(),
      request.inReplyToId,
    );
    this.posts.unshift(post);
    return Promise.resolve({ post: this.withFreshCounts(post) });
  }

  private findPost(id: string): Post | undefined {
    return this.posts.find((candidate) => candidate.id === id);
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
      counts: { replies: 0, likes: likers.size },
      viewerState: { liked: true, bookmarked: this.isBookmarked(session.userId, request.postId) },
    });
  }

  private unlikePost(request: UnlikePostRequest, accessToken: string): Promise<UnlikePostResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    this.likes.get(request.postId)?.delete(session.userId);
    return Promise.resolve({
      counts: { replies: 0, likes: this.likes.get(request.postId)?.size ?? 0 },
      viewerState: { liked: false, bookmarked: this.isBookmarked(session.userId, request.postId) },
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
      viewerState: {
        liked: this.likes.get(request.postId)?.has(session.userId) ?? false,
        bookmarked: true,
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
      viewerState: {
        liked: this.likes.get(request.postId)?.has(session.userId) ?? false,
        bookmarked: false,
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
          liked: this.likes.get(post.id)?.has(session.userId) ?? false,
          bookmarked: true,
        },
      }));
    const { items, page } = this.paginate(bookmarked, request.cursor, request.limit);
    return Promise.resolve({ posts: items, page });
  }

  private listPostLikers(request: ListPostLikersRequest): Promise<ListPostLikersResponse> {
    const likerIds = [...(this.likes.get(request.postId) ?? new Set<string>())];
    const actors = likerIds
      .map((id) => this.users.get(id))
      .filter((user): user is FakeUser => user !== undefined)
      .map((user) => this.toActor(user));
    const { items, page } = this.paginate(actors, request.cursor, request.limit);
    return Promise.resolve({ actors: items, page });
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
    return Promise.resolve({ notifications: items, page });
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
    const now = dateToTimestamp(new Date());
    let markedCount = 0;
    for (const notification of mine) {
      if (notification.readAt !== undefined) continue;
      if (!request.markAll && notification.id !== request.throughId) continue;
      notification.readAt = now;
      markedCount += 1;
      if (!request.markAll && notification.id === request.throughId) break;
    }
    // `markAll` marks every unread notification, not just those up to a cursor.
    if (request.markAll) {
      for (const notification of mine) {
        if (notification.readAt === undefined) {
          notification.readAt = now;
          markedCount += 1;
        }
      }
    }
    return Promise.resolve({ markedCount });
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
    return Promise.resolve({ count });
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
    return Promise.resolve({ relationship: this.relationship(session.userId, request.actorId) });
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
    return Promise.resolve({ relationship: this.relationship(session.userId, request.actorId) });
  }

  private muteActor(request: MuteActorRequest, accessToken: string): Promise<MuteActorResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const muted = this.mutes.get(session.userId) ?? new Set<string>();
    muted.add(request.actorId);
    this.mutes.set(session.userId, muted);
    return Promise.resolve({ relationship: this.relationship(session.userId, request.actorId) });
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
    return Promise.resolve({ relationship: this.relationship(session.userId, request.actorId) });
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
    return Promise.resolve({ actors: items, page });
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
    return Promise.resolve({ actors: items, page });
  }

  private reportPost(request: ReportPostRequest, accessToken: string): Promise<ReportPostResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    if (this.findPost(request.postId) === undefined) {
      return Promise.reject(grpcError(GrpcStatus.NOT_FOUND, 'That post no longer exists.'));
    }
    return Promise.resolve({ reportId: randomUUID() });
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
    return Promise.resolve({ reportId: randomUUID() });
  }
}

export function createFakeApi(options: FakeApiOptions = {}): FakeApiHandle {
  return new FakeApiHandle(options);
}
