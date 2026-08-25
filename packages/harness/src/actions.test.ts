import { describe, expect, it, vi } from 'vitest';

import { Code, ConnectError } from '@connectrpc/connect';
import type { PatchesApi } from '@patches/client';

import {
  assertActionProcessStatuses,
  assertPasswordStdinArgs,
  createHarnessApi,
  createPost,
  ensureWorld,
  notifications,
  register,
  safeCliErrorMessage,
  unknownCommandFailure,
  writeCliError,
  waitForUnread,
} from './actions.js';
import { assertWorldCompatible, declaredWorldManifest } from './world-state.js';

const session = {
  accessToken: 'access',
  refreshToken: 'refresh',
  actorId: 'actor-a',
  handle: 'alice',
};

describe('harness RPC actions', () => {
  it('uses authenticated direct RPC calls and returns JSON-safe post facts', async () => {
    let capturedHeaders: Headers | undefined;
    const createPostRpc = (_request: unknown, options: { headers: Headers }) => {
      capturedHeaders = options.headers;
      return Promise.resolve({ post: { id: 'post-a' } });
    };
    const api = { posts: { createPost: createPostRpc } } as unknown as PatchesApi;
    const result = await createPost(api, session, {
      body: 'hello',
      clientRequestId: '00000000-0000-4000-8000-000000000001',
    });
    expect(result).toMatchObject({
      id: 'post-a',
      clientRequestId: '00000000-0000-4000-8000-000000000001',
    });
    expect(capturedHeaders?.get('authorization')).toBe('Bearer access');
    expect(capturedHeaders?.get('x-request-id')).toBe(result.requestId);
  });

  it('bounds notification reads and excludes message notifications', async () => {
    const api = {
      notifications: {
        getUnreadCount: vi.fn().mockResolvedValue({ count: 2 }),
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [
            { id: 'follow', type: 1, actor: { id: 'actor-b' }, postId: '', conversationId: '' },
            {
              id: 'dm',
              type: 8,
              actor: { id: 'actor-c' },
              postId: '',
              conversationId: 'conversation',
            },
          ],
        }),
      },
    } as unknown as PatchesApi;
    const result = await notifications(api, session, 2);
    expect(result).toMatchObject({
      unread: 1,
      notifications: [{ id: 'follow', type: 1, actorId: 'actor-b', postId: '' }],
    });
    expect(result.requestIds).toHaveLength(1);
    await expect(notifications(api, session, 101)).rejects.toThrow('1-100');
  });

  it('polls only to a bounded deadline', async () => {
    const api = {
      notifications: {
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [
            { id: 'follow', conversationId: '', readAt: undefined },
            { id: 'dm', conversationId: 'dm-1', readAt: undefined },
          ],
        }),
      },
    } as unknown as PatchesApi;
    await expect(waitForUnread(api, session, 1, 10)).resolves.toMatchObject({ unread: 1 });
    await expect(waitForUnread(api, session, 1, 10_001)).rejects.toThrow('1-10000ms');
  });

  it('does not expose tokens in an explicit auth result', async () => {
    const api = {
      auth: {
        register: vi.fn().mockResolvedValue({
          session: {
            accessToken: 'access-secret',
            refreshToken: 'refresh-secret',
            actor: { id: 'actor-a', handle: 'alice' },
          },
        }),
      },
    } as unknown as PatchesApi;
    const auth = await register(api, {
      handle: 'alice',
      email: 'alice@harness.local',
      password: 'password-secret',
      clientRequestId: '00000000-0000-4000-8000-000000000001',
    });
    expect(JSON.stringify(auth.result)).not.toContain('secret');
    expect(
      safeCliErrorMessage(
        new Error('password=hunter2 accessToken=access-secret refresh_token=refresh-secret'),
      ),
    ).not.toMatch(/hunter2|access-secret|refresh-secret/u);
    expect(
      safeCliErrorMessage(new ConnectError('server echoed secret-body', Code.InvalidArgument)),
    ).not.toContain('secret-body');
    for (const hostile of [
      new Error('{"password":"hunter2"}'),
      new Error('"accessToken":"abc"; refreshToken=def'),
      new Error('https://example.test/?secret=ghi'),
      new Error('Error: key material\n    at private-stack-token'),
    ])
      expect(safeCliErrorMessage(hostile)).toBe('operation failed');
    let stderr = '';
    writeCliError(new Error('password=hunter2'), (content) => {
      stderr += content;
    });
    expect(stderr).toBe('patches-harness: operation failed\n');
  });

  it('revokes every world session even when a later action fails', async () => {
    const logoutAllSessions = vi.fn().mockResolvedValue({});
    const api = {
      auth: {
        register: vi.fn().mockResolvedValue({
          session: {
            accessToken: 'access-secret',
            refreshToken: 'refresh-secret',
            actor: { id: 'actor-a', handle: 'alice' },
          },
        }),
        logoutAllSessions,
        refreshSession: vi
          .fn()
          .mockRejectedValue(new ConnectError('revoked', Code.Unauthenticated)),
      },
      posts: { createPost: vi.fn().mockRejectedValue(new Error('post failed')) },
    } as unknown as PatchesApi;
    await expect(
      ensureWorld(
        api,
        {
          users: [{ key: 'alice', handle: 'alice', email: 'alice@harness.local' }],
          posts: [{ key: 'post-one', author: 'alice', body: 'hello' }],
        },
        () => 'derived-secret',
      ),
    ).rejects.toThrow('post failed');
    expect(logoutAllSessions).toHaveBeenCalledOnce();
  });

  it('recovers only the exact AlreadyExists registration case', async () => {
    const loginRpc = vi.fn().mockResolvedValue({
      session: {
        accessToken: 'access',
        refreshToken: 'refresh',
        actor: { id: 'actor-a', handle: 'alice' },
      },
    });
    const api = {
      auth: {
        register: vi.fn().mockRejectedValue(new ConnectError('exists', Code.AlreadyExists)),
        login: loginRpc,
        logoutAllSessions: vi.fn().mockResolvedValue({}),
        refreshSession: vi
          .fn()
          .mockRejectedValue(new ConnectError('revoked', Code.Unauthenticated)),
      },
    } as unknown as PatchesApi;
    await expect(
      ensureWorld(
        api,
        { users: [{ key: 'alice', handle: 'alice', email: 'alice@harness.local' }] },
        () => 'derived-password',
      ),
    ).resolves.toMatchObject({ users: 1 });
    expect(loginRpc).toHaveBeenCalledOnce();

    const unavailable = {
      auth: {
        register: vi.fn().mockRejectedValue(new ConnectError('down', Code.Unavailable)),
        login: loginRpc,
      },
    } as unknown as PatchesApi;
    await expect(
      ensureWorld(
        unavailable,
        { users: [{ key: 'alice', handle: 'alice', email: 'alice@harness.local' }] },
        () => 'derived-password',
      ),
    ).rejects.toMatchObject({ code: Code.Unavailable });
  });

  it('successfully reapplies an exact stable-key world', async () => {
    const sessionEnvelope = {
      session: {
        accessToken: 'access',
        refreshToken: 'refresh',
        actor: { id: 'actor-a', handle: 'alice' },
      },
    };
    const registerRpc = vi
      .fn()
      .mockResolvedValueOnce(sessionEnvelope)
      .mockRejectedValueOnce(new ConnectError('exists', Code.AlreadyExists));
    const api = {
      auth: {
        register: registerRpc,
        login: vi.fn().mockResolvedValue(sessionEnvelope),
        logoutAllSessions: vi.fn().mockResolvedValue({}),
        refreshSession: vi
          .fn()
          .mockRejectedValue(new ConnectError('revoked', Code.Unauthenticated)),
      },
      posts: { createPost: vi.fn().mockResolvedValue({ post: { id: 'stable-post' } }) },
    } as unknown as PatchesApi;
    const world = {
      users: [{ key: 'alice', handle: 'alice', email: 'alice@harness.local' }],
      posts: [{ key: 'hello', author: 'alice', body: 'hello' }],
    };
    const first = await ensureWorld(api, world, () => 'derived-password');
    const second = await ensureWorld(api, world, () => 'derived-password');
    expect(first.posts[0]?.id).toBe('stable-post');
    expect(second.posts[0]?.id).toBe('stable-post');
    expect(first.posts[0]?.clientRequestId).toBe(second.posts[0]?.clientRequestId);
  });

  it('journals successful ownership before a later user fails and cleans partial sessions', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const logoutAllSessions = vi.fn().mockResolvedValue({});
    const registerRpc = vi
      .fn()
      .mockResolvedValueOnce({
        session: {
          accessToken: 'access-a',
          refreshToken: 'refresh-a',
          actor: { id: 'actor-a', handle: 'alice' },
        },
      })
      .mockRejectedValueOnce(new ConnectError('unavailable', Code.Unavailable));
    const api = {
      auth: {
        register: registerRpc,
        logoutAllSessions,
        refreshSession: vi
          .fn()
          .mockRejectedValue(new ConnectError('revoked', Code.Unauthenticated)),
      },
    } as unknown as PatchesApi;
    await expect(
      ensureWorld(
        api,
        {
          users: [
            { key: 'alice', handle: 'alice', email: 'alice@harness.local' },
            { key: 'bob', handle: 'bob', email: 'bob@harness.local' },
          ],
        },
        () => 'derived-password',
        record,
      ),
    ).rejects.toMatchObject({ code: Code.Unavailable });
    expect(record).toHaveBeenCalledExactlyOnceWith('alice');
    expect(logoutAllSessions).toHaveBeenCalledOnce();
  });

  it('does not let a DM-only notification satisfy a wait', async () => {
    const timeouts: number[] = [];
    const api = {
      notifications: {
        listNotifications: vi.fn((_request: unknown, options: { timeoutMs: number }) => {
          timeouts.push(options.timeoutMs);
          return Promise.resolve({
            notifications: [{ id: 'dm', type: 8, conversationId: '', readAt: undefined }],
          });
        }),
      },
    } as unknown as PatchesApi;
    await expect(waitForUnread(api, session, 1, 20)).rejects.toThrow('non-DM');
    expect(timeouts.every((timeout) => timeout <= 20)).toBe(true);
  });

  it('uses stable world keys across reordering and fails closed on drift or removal', () => {
    const first = declaredWorldManifest({
      users: [
        { key: 'bob', handle: 'bob', email: 'bob@harness.local' },
        { key: 'alice', handle: 'alice', email: 'alice@harness.local' },
      ],
      posts: [{ key: 'hello', author: 'alice', body: 'hello' }],
    });
    const reordered = declaredWorldManifest({
      users: [
        { key: 'alice', handle: 'alice', email: 'alice@harness.local' },
        { key: 'bob', handle: 'bob', email: 'bob@harness.local' },
      ],
      posts: [{ key: 'hello', author: 'alice', body: 'hello' }],
    });
    expect(reordered.digest).toBe(first.digest);
    expect(() => assertWorldCompatible(reordered, first)).not.toThrow();
    const removed = declaredWorldManifest({ users: [] });
    expect(() => assertWorldCompatible(removed, first)).toThrow('drift/removal');
  });

  it('refuses non-loopback action targets', () => {
    expect(() => createHarnessApi('production.example:443')).toThrow('loopback');
  });

  it('requires stdin passwords and refuses a missing worker', () => {
    expect(() => assertPasswordStdinArgs(['--password-stdin'])).not.toThrow();
    expect(() => assertPasswordStdinArgs(['--password=secret'])).toThrow('password-stdin');
    expect(() => assertPasswordStdinArgs([])).toThrow('password-stdin');
    expect(() => assertActionProcessStatuses('owned-running', 'stopped')).toThrow('worker');
    expect(() => assertActionProcessStatuses('owned-running', 'owned-running')).not.toThrow();
  });

  it('never reflects a hostile unknown subcommand', () => {
    const hostile = 'unknown--password=hunter2--refreshToken=secret';
    expect(unknownCommandFailure()).toBe('Unknown command');
    expect(unknownCommandFailure()).not.toContain(hostile);
  });
});
