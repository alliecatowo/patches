import { fromDate } from '../api/wire/time.js';
import type { Nameplate, Session } from '../api/wire/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CliIo } from './io.js';

const updateProfile = vi.fn();
const refreshSession = vi.fn();
const close = vi.fn();
const fakeApi = { target: '127.0.0.1:50051', updateProfile, refreshSession, close };

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

const { runProfile } = await import('./profile.js');

function makeSession(nameplate?: Nameplate): Session {
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
      joinedAt: fromDate(new Date()),
      counts: { followers: 0, following: 0, posts: 0 },
      nameplate,
      flair: undefined,
      pinnedPostIds: [],
    },
    accessToken: 'access-token',
    accessExpiresAt: fromDate(new Date(now + 3_600_000)),
    refreshToken: 'refresh-token',
    refreshExpiresAt: fromDate(new Date(now + 30 * 24 * 3_600_000)),
    emailVerified: true,
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

describe('runProfile edit', () => {
  it('requires a subcommand', async () => {
    const io = makeIo();
    const exitCode = await runProfile([], { io, ...DEPS });
    expect(exitCode).toBe(1);
    expect(io.err.join('')).toContain('A subcommand is required');
  });

  it('requires an existing session', async () => {
    const io = makeIo();
    const exitCode = await runProfile(['edit', '--bio', 'hi'], { io, ...DEPS });
    expect(exitCode).toBe(1);
    expect(io.err.join('')).toContain('Not signed in');
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('requires at least one field to change', async () => {
    stored = { userId: 'u1', refreshToken: 'refresh-token' };
    refreshSession.mockResolvedValue({ session: makeSession() });
    const io = makeIo();

    const exitCode = await runProfile(['edit'], { io, ...DEPS });

    expect(exitCode).toBe(1);
    expect(io.err.join('')).toContain('Nothing to change');
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('sends only the fields given, and prints the updated handle/display name', async () => {
    stored = { userId: 'u1', refreshToken: 'refresh-token' };
    refreshSession.mockResolvedValue({ session: makeSession() });
    updateProfile.mockResolvedValue({
      actor: { ...makeSession().actor, bio: 'new bio', displayName: 'Alice A' },
    });
    const io = makeIo();

    const exitCode = await runProfile(['edit', '--bio', 'new bio'], { io, ...DEPS });

    expect(exitCode).toBe(0);
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ bio: 'new bio', updateMask: ['bio'] }),
      'access-token',
    );
    expect(io.out.join('')).toContain('@alice · Alice A');
  });

  it('builds updateMask from every field given', async () => {
    stored = { userId: 'u1', refreshToken: 'refresh-token' };
    refreshSession.mockResolvedValue({ session: makeSession() });
    updateProfile.mockResolvedValue({ actor: makeSession().actor });
    const io = makeIo();

    await runProfile(
      ['edit', '--display-name', 'A', '--location', 'Earth', '--website', 'https://a.example'],
      { io, ...DEPS },
    );

    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'A',
        locationText: 'Earth',
        websiteUrl: 'https://a.example',
        updateMask: ['display_name', 'location_text', 'website_url'],
      }),
      'access-token',
    );
  });

  it('sends the whole nameplate submessage under a single "nameplate" mask path (A-037)', async () => {
    stored = { userId: 'u1', refreshToken: 'refresh-token' };
    refreshSession.mockResolvedValue({ session: makeSession() });
    updateProfile.mockResolvedValue({ actor: makeSession().actor });
    const io = makeIo();

    await runProfile(['edit', '--name-color', '#7C3AED', '--glyph', '*', '--status-line', 'brb'], {
      io,
      ...DEPS,
    });

    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        updateMask: ['nameplate'],
        nameplate: {
          nameColor: '#7C3AED',
          glyph: '*',
          badges: [],
          avatarFrame: '',
          statusLine: 'brb',
          profileBorder: '',
        },
      }),
      'access-token',
    );
  });

  it('merges an unspecified nameplate field from the current session actor rather than blanking it', async () => {
    stored = { userId: 'u1', refreshToken: 'refresh-token' };
    refreshSession.mockResolvedValue({
      session: makeSession({
        nameColor: '#111111',
        glyph: '',
        badges: ['moderator'],
        avatarFrame: '',
        statusLine: 'existing status',
        profileBorder: 'round',
      }),
    });
    updateProfile.mockResolvedValue({ actor: makeSession().actor });
    const io = makeIo();

    // Only --glyph is given — name_color, status_line, and profile_border must keep
    // their current values in the outgoing nameplate, not go blank. `badges` is
    // never read from the current actor — it is server-attested only and always
    // sent empty (spec §173), regardless of what the current actor carries.
    await runProfile(['edit', '--glyph', '★'], { io, ...DEPS });

    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        updateMask: ['nameplate'],
        nameplate: {
          nameColor: '#111111',
          glyph: '★',
          badges: [],
          avatarFrame: '',
          statusLine: 'existing status',
          profileBorder: 'round',
        },
      }),
      'access-token',
    );
  });
});
