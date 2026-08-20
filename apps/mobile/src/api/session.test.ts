import { create } from '@bufbuild/protobuf';
import { ActorSchema, SessionSchema } from '@patches/proto/es';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `withSession` here mirrors `@patches/client`'s real single-flight-refresh contract
 * closely enough for this module's own logic (attach header, clear on failure) without
 * pulling in a real transport — `SessionManager` itself is already unit-tested in
 * `packages/client/src/session.test.ts`. `vi.mock`'s factory is hoisted above every
 * top-level statement in this file (including plain `const`s), so anything it references
 * has to be created inside `vi.hoisted` instead of a normal top-level `const`.
 */
const { state, sessionManagerMock, getCurrentSession } = vi.hoisted(() => {
  const hoistedState: { accessToken: string | undefined } = { accessToken: undefined };
  return {
    state: hoistedState,
    sessionManagerMock: {
      getAccessToken: vi.fn(() => Promise.resolve(hoistedState.accessToken)),
      setSession: vi.fn((session: { accessToken: string; refreshToken: string }) => {
        hoistedState.accessToken = session.accessToken;
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        hoistedState.accessToken = undefined;
        return Promise.resolve();
      }),
      withSession: vi.fn(async <T>(fn: (accessToken: string) => Promise<T>): Promise<T> => {
        if (hoistedState.accessToken === undefined) throw new Error('Not signed in.');
        return fn(hoistedState.accessToken);
      }),
    },
    getCurrentSession: vi.fn(),
  };
});

// `vi.mock` is hoisted above every import in this file by vitest, so `./session.js` below
// (a plain static import) already sees the mocked `./client.js` when it evaluates.
vi.mock('./client.js', () => ({
  api: { auth: { getCurrentSession } },
  sessionManager: sessionManagerMock,
}));

import {
  establishSession,
  getCurrentActor,
  restoreSession,
  signOut,
  subscribeSession,
} from './session.js';

function actor(handle: string) {
  return create(ActorSchema, { id: `actor-${handle}`, handle });
}

describe('mobile session store', () => {
  beforeEach(() => {
    state.accessToken = undefined;
    getCurrentSession.mockReset();
    vi.clearAllMocks();
  });

  it('establishSession persists tokens and sets the current actor', async () => {
    const session = create(SessionSchema, {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      actor: actor('allie'),
    });

    await establishSession(session);

    expect(sessionManagerMock.setSession).toHaveBeenCalledWith({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    expect(getCurrentActor()?.handle).toBe('allie');
  });

  it('signOut clears the token store and the current actor', async () => {
    await establishSession(
      create(SessionSchema, { accessToken: 'a', refreshToken: 'r', actor: actor('allie') }),
    );

    await signOut();

    expect(sessionManagerMock.clear).toHaveBeenCalled();
    expect(getCurrentActor()).toBeNull();
  });

  it('restoreSession returns null with no stored token, without calling the server', async () => {
    const result = await restoreSession();

    expect(result).toBeNull();
    expect(getCurrentSession).not.toHaveBeenCalled();
  });

  it('restoreSession fetches the actor with an explicit bearer header (AuthService is not auto-authed)', async () => {
    state.accessToken = 'stored-token';
    getCurrentSession.mockResolvedValue({ actor: actor('allie') });

    const result = await restoreSession();

    expect(result?.handle).toBe('allie');
    expect(getCurrentSession).toHaveBeenCalledWith(
      {},
      { headers: { authorization: 'Bearer stored-token' } },
    );
  });

  it('restoreSession clears the session when the server rejects the stored token', async () => {
    state.accessToken = 'stale-token';
    getCurrentSession.mockRejectedValue(new Error('Unauthenticated'));

    const result = await restoreSession();

    expect(result).toBeNull();
    expect(sessionManagerMock.clear).toHaveBeenCalled();
    expect(getCurrentActor()).toBeNull();
  });

  it('notifies subscribers when the actor changes', async () => {
    const seen: (string | null)[] = [];
    const unsubscribe = subscribeSession((next) => seen.push(next?.handle ?? null));

    await establishSession(
      create(SessionSchema, { accessToken: 'a', refreshToken: 'r', actor: actor('allie') }),
    );
    await signOut();
    unsubscribe();

    expect(seen).toEqual(['allie', null]);
  });
});
