import { randomUUID } from 'node:crypto';

import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  dateToTimestamp,
  POST_TYPE,
  POST_VISIBILITY,
  type Actor,
  type CreatePostRequest,
  type CreatePostResponse,
  type GetActorByHandleRequest,
  type GetActorByHandleResponse,
  type GetActorRequest,
  type GetActorResponse,
  type GetServerInfoResponse,
  type ListActorPostsRequest,
  type ListActorPostsResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type LoginRequest,
  type LoginResponse,
  type Post,
  type RefreshSessionRequest,
  type RefreshSessionResponse,
  type RegisterRequest,
  type RegisterResponse,
  type Session,
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
      listActorPosts: (request: ListActorPostsRequest) => this.listActorPosts(request),
      listLocalFeed: (request: ListLocalFeedRequest) => this.listLocalFeed(request),
      createPost: (request: CreatePostRequest, accessToken: string) =>
        this.createPost(request, accessToken),
      close: () => undefined,
    } as unknown as PatchesApi;
  }

  /** Registers a local account the fake server will accept `Login` for. */
  addUser(user: Omit<FakeUser, 'id'> & { id?: string }): FakeUser {
    const full: FakeUser = { id: user.id ?? randomUUID(), ...user };
    this.users.set(full.id, full);
    return full;
  }

  /** Seeds a post directly (bypassing `CreatePost`), newest-first like the real feed. */
  addPost(authorId: string, body: string, createdAt: Date = new Date()): Post {
    const post = this.buildPost(randomUUID(), authorId, body, createdAt);
    this.posts.unshift(post);
    return post;
  }

  private toActor(user: FakeUser): Actor {
    const postCount = this.posts.filter((post) => post.author?.id === user.id).length;
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
      counts: { followers: 0, following: 0, posts: postCount },
    };
  }

  private buildPost(id: string, authorId: string, body: string, createdAt: Date): Post {
    const user = this.users.get(authorId);
    if (user === undefined) throw new Error(`fake api: no such user ${authorId}`);
    return {
      id,
      author: this.toActor(user),
      body,
      postType: POST_TYPE.NOTE,
      linkUrl: '',
      visibility: POST_VISIBILITY.PUBLIC,
      inReplyToId: '',
      rootPostId: id,
      media: [],
      createdAt: dateToTimestamp(createdAt),
      editedAt: undefined,
      deleted: false,
      counts: { replies: 0, likes: 0 },
      viewerState: { liked: false, bookmarked: false },
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

  private paginate(all: readonly Post[], cursor: string, limit: number) {
    const start = cursor === '' ? 0 : Number(cursor);
    const effectiveLimit = limit > 0 ? limit : this.pageSize;
    const page = all.slice(start, start + effectiveLimit);
    const next = start + page.length;
    return {
      posts: page,
      page: { nextCursor: next < all.length ? String(next) : '', hasMore: next < all.length },
    };
  }

  private listActorPosts(request: ListActorPostsRequest): Promise<ListActorPostsResponse> {
    const forActor = this.posts.filter((post) => post.author?.id === request.actorId);
    return Promise.resolve(this.paginate(forActor, request.cursor, request.limit));
  }

  private listLocalFeed(request: ListLocalFeedRequest): Promise<ListLocalFeedResponse> {
    return Promise.resolve(this.paginate(this.posts, request.cursor, request.limit));
  }

  private createPost(request: CreatePostRequest, accessToken: string): Promise<CreatePostResponse> {
    const session = this.requireSession(accessToken);
    if (session === undefined) {
      return Promise.reject(grpcError(GrpcStatus.UNAUTHENTICATED, 'access token unknown/expired'));
    }
    const post = this.buildPost(randomUUID(), session.userId, request.body, new Date());
    this.posts.unshift(post);
    return Promise.resolve({ post });
  }
}

export function createFakeApi(options: FakeApiOptions = {}): FakeApiHandle {
  return new FakeApiHandle(options);
}
