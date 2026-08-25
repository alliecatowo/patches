import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { Code, ConnectError } from '@connectrpc/connect';
import { createPatchesApi, type PatchesApi } from '@patches/client';
import { createGrpcTransport } from '@patches/client/grpc';
import { NotificationType } from '@patches/proto/es';

const MAX_NOTIFICATION_LIMIT = 100;

export function assertActionProcessStatuses(server: string, worker: string): void {
  if (server !== 'owned-running' || worker !== 'owned-running')
    throw new Error('harness server and worker must both be owned and running');
}

export function assertPasswordStdinArgs(args: readonly string[]): void {
  if (
    !args.includes('--password-stdin') ||
    args.some((argument) => argument === '--password' || argument.startsWith('--password='))
  )
    throw new Error('passwords are accepted only with --password-stdin');
}

export function safeCliErrorMessage(error: unknown): string {
  if (error instanceof ConnectError) return `RPC failed with code ${String(error.code)}`;
  return 'operation failed';
}

export function unknownCommandFailure(): string {
  return 'Unknown command';
}

export function writeCliError(
  error: unknown,
  write: (content: string) => void = (content) => process.stderr.write(content),
): void {
  write(`patches-harness: ${safeCliErrorMessage(error)}\n`);
}

export interface HarnessSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly actorId: string;
  readonly handle: string;
}

export interface PublicAuthResult {
  readonly actorId: string;
  readonly handle: string;
  readonly requestId: string;
}

export function createHarnessApi(target: string): { readonly api: PatchesApi } {
  if (!/^127\.0\.0\.1:\d{1,5}$/.test(target))
    throw new Error('harness RPC target must be a loopback host:port');
  return {
    api: createPatchesApi({
      transport: createGrpcTransport({ baseUrl: `http://${target}` }),
      clientName: 'patches-harness',
      clientVersion: '0.1.0',
    }),
  };
}

function requestOptions(requestId: string, session?: HarnessSession, timeoutMs?: number) {
  return {
    headers: new Headers({
      ...(session === undefined ? {} : { authorization: `Bearer ${session.accessToken}` }),
      'x-request-id': requestId,
    }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

function sessionFrom(response: {
  session?:
    | {
        accessToken: string;
        refreshToken: string;
        actor?: { id: string; handle: string } | undefined;
      }
    | undefined;
}): HarnessSession {
  const session = response.session;
  if (session?.actor === undefined || session.accessToken === '' || session.refreshToken === '')
    throw new Error('authentication response did not contain a complete session');
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    actorId: session.actor.id,
    handle: session.actor.handle,
  };
}

function publicAuth(session: HarnessSession, requestId: string): PublicAuthResult {
  return { actorId: session.actorId, handle: session.handle, requestId };
}

export async function register(
  api: PatchesApi,
  input: { handle: string; email: string; password: string; clientRequestId: string },
): Promise<{ session: HarnessSession; result: PublicAuthResult }> {
  const requestId = randomUUID();
  const session = sessionFrom(
    await api.auth.register(
      {
        handle: input.handle,
        displayName: input.handle,
        email: input.email,
        password: input.password,
        clientRequestId: input.clientRequestId,
        inviteCode: '',
        privacyNoticeVersionAcknowledged: 0,
        sshPublicKey: '',
      },
      requestOptions(requestId),
    ),
  );
  return { session, result: publicAuth(session, requestId) };
}

export async function login(
  api: PatchesApi,
  input: { emailOrHandle: string; password: string },
): Promise<{ session: HarnessSession; result: PublicAuthResult }> {
  const requestId = randomUUID();
  const session = sessionFrom(await api.auth.login(input, requestOptions(requestId)));
  return { session, result: publicAuth(session, requestId) };
}

export async function logoutAll(
  api: PatchesApi,
  session: HarnessSession,
): Promise<{ requestId: string }> {
  const requestId = randomUUID();
  await api.auth.logoutAllSessions({}, requestOptions(requestId, session));
  return { requestId };
}

async function sessionIsRevoked(api: PatchesApi, session: HarnessSession): Promise<boolean> {
  const requestId = randomUUID();
  try {
    await api.auth.refreshSession(
      { refreshToken: session.refreshToken },
      requestOptions(requestId),
    );
    return false;
  } catch (error) {
    return error instanceof ConnectError && error.code === Code.Unauthenticated;
  }
}

export async function createPost(
  api: PatchesApi,
  session: HarnessSession,
  input: { body: string; clientRequestId: string },
): Promise<{ id: string; clientRequestId: string; requestId: string }> {
  const requestId = randomUUID();
  const response = await api.posts.createPost(
    {
      clientRequestId: input.clientRequestId,
      body: input.body,
      linkUrl: '',
      visibility: 1,
      inReplyToId: '',
      mediaIds: [],
      contentWarning: '',
      quotedPostId: '',
      communityId: '',
      quotePolicy: 1,
    },
    requestOptions(requestId, session),
  );
  if (response.post === undefined || response.post.id === '')
    throw new Error('create post response did not contain a post id');
  return { id: response.post.id, clientRequestId: input.clientRequestId, requestId };
}

export async function deletePost(
  api: PatchesApi,
  session: HarnessSession,
  id: string,
): Promise<{ id: string; requestId: string }> {
  const requestId = randomUUID();
  await api.posts.deletePost({ id }, requestOptions(requestId, session));
  return { id, requestId };
}

export async function follow(
  api: PatchesApi,
  session: HarnessSession,
  actorId: string,
): Promise<{ actorId: string; requested: boolean; requestId: string }> {
  const requestId = randomUUID();
  const response = await api.socialGraph.followActor(
    { actorId },
    requestOptions(requestId, session),
  );
  return { actorId, requested: response.requested, requestId };
}

export async function unfollow(
  api: PatchesApi,
  session: HarnessSession,
  actorId: string,
): Promise<{ actorId: string; requestId: string }> {
  const requestId = randomUUID();
  await api.socialGraph.unfollowActor({ actorId }, requestOptions(requestId, session));
  return { actorId, requestId };
}

type Notification = Awaited<
  ReturnType<PatchesApi['notifications']['listNotifications']>
>['notifications'][number];

function nonDm(items: readonly Notification[]): readonly Notification[] {
  return items.filter(
    (item) => item.type !== NotificationType.MESSAGE && item.conversationId === '',
  );
}

export async function notifications(
  api: PatchesApi,
  session: HarnessSession,
  limit: number,
): Promise<{
  unread: number;
  requestIds: readonly string[];
  notifications: readonly { id: string; type: number; actorId: string; postId: string }[];
}> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_NOTIFICATION_LIMIT)
    throw new Error(`notification limit must be 1-${MAX_NOTIFICATION_LIMIT}`);
  const requestId = randomUUID();
  const list = await api.notifications.listNotifications(
    { cursor: '', limit },
    requestOptions(requestId, session),
  );
  const safe = nonDm(list.notifications);
  return {
    unread: safe.filter((item) => item.readAt === undefined).length,
    requestIds: [requestId],
    notifications: safe.map((item) => ({
      id: item.id,
      type: item.type,
      actorId: item.actor?.id ?? '',
      postId: item.postId,
    })),
  };
}

export async function waitForUnread(
  api: PatchesApi,
  session: HarnessSession,
  atLeast: number,
  timeoutMs: number,
): Promise<{ unread: number; requestIds: readonly string[] }> {
  if (!Number.isInteger(atLeast) || atLeast < 0)
    throw new Error('unread threshold must be a non-negative integer');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000)
    throw new Error('notification timeout must be 1-10000ms');
  const deadline = Date.now() + timeoutMs;
  const requestIds: string[] = [];
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new Error(`timed out waiting for ${atLeast} non-DM unread notifications`);
    const requestId = randomUUID();
    requestIds.push(requestId);
    const list = await api.notifications.listNotifications(
      { cursor: '', limit: MAX_NOTIFICATION_LIMIT },
      requestOptions(requestId, session, remaining),
    );
    const unread = nonDm(list.notifications).filter((item) => item.readAt === undefined).length;
    if (unread >= atLeast) return { unread, requestIds };
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(100, Math.max(0, deadline - Date.now()))),
    );
  }
}

export interface HarnessWorld {
  readonly users: readonly { key: string; handle: string; email: string }[];
  readonly follows?: readonly { key: string; from: string; to: string }[];
  readonly posts?: readonly { key: string; author: string; body: string }[];
}

export async function readWorld(path: string): Promise<HarnessWorld> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isWorld(parsed)) throw new Error('world must use stable keys and contain no credentials');
  return parsed;
}

function isWorld(value: unknown): value is HarnessWorld {
  if (containsSecretProperty(value)) return false;
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as { users?: unknown }).users)
  )
    return false;
  const strings = (item: unknown, keys: readonly string[]) =>
    typeof item === 'object' &&
    item !== null &&
    keys.every((key) => typeof (item as Record<string, unknown>)[key] === 'string');
  const world = value as { users: unknown[]; follows?: unknown; posts?: unknown };
  if (!exactObjectKeys(value, ['users', 'follows', 'posts'])) return false;
  if (!world.users.every((item) => exactObjectKeys(item, ['key', 'handle', 'email']))) return false;
  if (!world.users.every((item) => strings(item, ['key', 'handle', 'email']))) return false;
  if (
    world.follows !== undefined &&
    (!Array.isArray(world.follows) ||
      !world.follows.every(
        (item) =>
          exactObjectKeys(item, ['key', 'from', 'to']) && strings(item, ['key', 'from', 'to']),
      ))
  )
    return false;
  if (
    world.posts !== undefined &&
    (!Array.isArray(world.posts) ||
      !world.posts.every(
        (item) =>
          exactObjectKeys(item, ['key', 'author', 'body']) &&
          strings(item, ['key', 'author', 'body']),
      ))
  )
    return false;
  const typed = value as HarnessWorld;
  const keys = [...typed.users, ...(typed.follows ?? []), ...(typed.posts ?? [])].map(
    (item) => item.key,
  );
  return keys.every((key) => key.length > 0) && new Set(keys).size === keys.length;
}

function exactObjectKeys(value: unknown, allowed: readonly string[]): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => allowed.includes(key));
}

function containsSecretProperty(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretProperty);
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      /password|access.?token|refresh.?token|secret/i.test(key) || containsSecretProperty(nested),
  );
}

function deterministicId(namespace: string, key: string): string {
  const hex = createHash('sha256').update(`${namespace}\0${key}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export async function ensureWorld(
  api: PatchesApi,
  world: HarnessWorld,
  passwordForKey: (key: string) => string,
  recordMutation: (key: string) => Promise<void> = () => Promise.resolve(),
): Promise<{
  users: number;
  follows: number;
  posts: readonly { id: string; clientRequestId: string; requestId: string }[];
  requestIds: readonly string[];
  sessionsRevoked: boolean;
}> {
  const sessions = new Map<string, HarnessSession>();
  const requestIds: string[] = [];
  let output:
    | {
        users: number;
        follows: number;
        posts: readonly { id: string; clientRequestId: string; requestId: string }[];
        requestIds: readonly string[];
        sessionsRevoked: boolean;
      }
    | undefined;
  let actionError: unknown;
  let cleanupFailed: boolean;
  try {
    for (const user of world.users) {
      const password = passwordForKey(user.key);
      try {
        const result = await register(api, {
          handle: user.handle,
          email: user.email,
          password,
          clientRequestId: deterministicId('user', user.key),
        });
        sessions.set(user.key, result.session);
        requestIds.push(result.result.requestId);
        await recordMutation(user.key);
      } catch (error) {
        if (!(error instanceof ConnectError) || error.code !== Code.AlreadyExists) throw error;
        const result = await login(api, { emailOrHandle: user.handle, password });
        sessions.set(user.key, result.session);
        requestIds.push(result.result.requestId);
        await recordMutation(user.key);
      }
    }
    for (const edge of world.follows ?? []) {
      const from = sessions.get(edge.from);
      const to = sessions.get(edge.to);
      if (from === undefined || to === undefined)
        throw new Error(`follow ${edge.key} refers to an unknown user key`);
      requestIds.push((await follow(api, from, to.actorId)).requestId);
      await recordMutation(edge.key);
    }
    const posts: { id: string; clientRequestId: string; requestId: string }[] = [];
    for (const post of world.posts ?? []) {
      const author = sessions.get(post.author);
      if (author === undefined) throw new Error(`post ${post.key} refers to an unknown user key`);
      const result = await createPost(api, author, {
        body: post.body,
        clientRequestId: deterministicId('post', post.key),
      });
      posts.push(result);
      requestIds.push(result.requestId);
      await recordMutation(post.key);
    }
    output = {
      users: sessions.size,
      follows: world.follows?.length ?? 0,
      posts,
      requestIds,
      sessionsRevoked: false,
    };
  } catch (error) {
    actionError = error;
  } finally {
    const cleanups = await Promise.allSettled(
      [...sessions.values()].map((session) => logoutAll(api, session)),
    );
    for (const cleanup of cleanups) {
      if (cleanup.status === 'fulfilled') requestIds.push(cleanup.value.requestId);
    }
    cleanupFailed = cleanups.some((cleanup) => cleanup.status === 'rejected');
    if (!cleanupFailed) {
      const revoked = await Promise.all(
        [...sessions.values()].map((session) => sessionIsRevoked(api, session)),
      );
      cleanupFailed = revoked.some((value) => !value);
      if (output !== undefined) output = { ...output, sessionsRevoked: !cleanupFailed };
    }
  }
  if (cleanupFailed) throw new Error('one or more world sessions could not be revoked');
  if (actionError instanceof Error) throw actionError;
  if (actionError !== undefined) throw new Error('world ensure failed');
  if (output === undefined) throw new Error('world ensure did not produce a result');
  return output;
}
