import { dateToTimestamp, type Session } from '@patches/proto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CliIo } from './io.js';

const verifyEmail = vi.fn();
const resendVerification = vi.fn();
const refreshSession = vi.fn();
const close = vi.fn();
const fakeApi = {
  target: '127.0.0.1:50051',
  verifyEmail,
  resendVerification,
  refreshSession,
  close,
};

let stored: { userId: string; refreshToken: string } | undefined;

vi.mock('./auth-shared.js', () => ({
  createApi: vi.fn(() => fakeApi),
  openCredentialStore: vi.fn(() =>
    Promise.resolve({
      get: () =>
        Promise.resolve(
          stored === undefined
            ? undefined
            : {
                nodeOrigin: '127.0.0.1:50051',
                userId: stored.userId,
                actorHandle: 'alice',
                refreshToken: stored.refreshToken,
                refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
              },
        ),
      set: () => Promise.resolve(undefined),
      delete: () => Promise.resolve(undefined),
      list: () => Promise.resolve([]),
    }),
  ),
  reportAuthError: (io: CliIo, error: unknown) => {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
  },
}));

const { runVerify } = await import('./verify.js');

function makeSession(): Session {
  const now = Date.now();
  return {
    actor: {
      id: 'u1',
      handle: 'alice',
      displayName: 'Alice',
      bio: '',
      locationText: '',
      websiteUrl: '',
      avatar: undefined,
      isLocal: true,
      joinedAt: dateToTimestamp(new Date()),
      counts: { followers: 0, following: 0, posts: 0 },
      nameplate: undefined,
      flair: undefined,
      pinnedPostIds: [],
    },
    accessToken: 'access-token',
    accessExpiresAt: dateToTimestamp(new Date(now + 3_600_000)),
    refreshToken: 'refresh-token',
    refreshExpiresAt: dateToTimestamp(new Date(now + 30 * 24 * 3_600_000)),
    emailVerified: false,
    node: '127.0.0.1:50051',
  };
}

function makeIo(): CliIo & { out: string[]; err: string[] } {
  return {
    isTTY: false,
    out: [],
    err: [],
    stdout(text: string) {
      this.out.push(text);
    },
    stderr(text: string) {
      this.err.push(text);
    },
    prompt: () => Promise.reject(new Error('not used')),
    promptPassword: () => Promise.reject(new Error('not used')),
    readStdin: () => Promise.reject(new Error('not used')),
  };
}

afterEach(() => {
  vi.clearAllMocks();
  stored = undefined;
});

const DEPS = { env: {}, target: '127.0.0.1:50051', insecure: true };

describe('runVerify <code>', () => {
  it('prints "Email verified." on success', async () => {
    verifyEmail.mockResolvedValue({ emailVerified: true });
    const io = makeIo();

    const exitCode = await runVerify(['abc123'], { io, ...DEPS });

    expect(verifyEmail).toHaveBeenCalledWith({ code: 'abc123' });
    expect(exitCode).toBe(0);
    expect(io.out.join('')).toContain('Email verified.');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reports failure without a raw code/stack when the server rejects it', async () => {
    verifyEmail.mockRejectedValue(Object.assign(new Error('bad code'), { code: 3 }));
    const io = makeIo();

    const exitCode = await runVerify(['wrong'], { io, ...DEPS });

    expect(exitCode).toBe(1);
    expect(io.err.join('')).not.toContain('    at ');
  });

  it('reports failure when the server says the code did not verify', async () => {
    verifyEmail.mockResolvedValue({ emailVerified: false });
    const io = makeIo();

    const exitCode = await runVerify(['abc123'], { io, ...DEPS });

    expect(exitCode).toBe(1);
    expect(io.err.join('')).toContain('did not verify');
  });

  it('requires a code', async () => {
    const io = makeIo();
    const exitCode = await runVerify([], { io, ...DEPS });
    expect(exitCode).toBe(1);
    expect(io.err.join('')).toContain('A verification code is required');
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it('-h prints usage without calling the server', async () => {
    const io = makeIo();
    const exitCode = await runVerify(['-h'], { io, ...DEPS });
    expect(exitCode).toBe(0);
    expect(io.out.join('')).toContain('Usage: patches verify');
    expect(verifyEmail).not.toHaveBeenCalled();
  });
});

describe('runVerify --resend', () => {
  it('requires an existing session', async () => {
    const io = makeIo();
    const exitCode = await runVerify(['--resend'], { io, ...DEPS });
    expect(exitCode).toBe(1);
    expect(io.err.join('')).toContain('Not signed in');
    expect(resendVerification).not.toHaveBeenCalled();
  });

  it('resends and prints confirmation when signed in', async () => {
    stored = { userId: 'u1', refreshToken: 'refresh-token' };
    refreshSession.mockResolvedValue({ session: makeSession() });
    resendVerification.mockResolvedValue({});
    const io = makeIo();

    const exitCode = await runVerify(['--resend'], { io, ...DEPS });

    expect(exitCode).toBe(0);
    expect(resendVerification).toHaveBeenCalledWith('access-token');
    expect(io.out.join('')).toContain('Verification email sent.');
  });
});
