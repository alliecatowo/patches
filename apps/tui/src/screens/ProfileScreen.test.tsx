import { FOLLOW_STATE } from '../api/wire/enums.js';
import type { Actor, Relationship } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { ProfileScreen } from './ProfileScreen.js';

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 'actor-2',
    handle: 'bob',
    displayName: '',
    bio: '',
    locationText: '',
    websiteUrl: '',
    avatar: undefined,
    isLocal: true,
    joinedAt: undefined,
    counts: undefined,
    nameplate: undefined,
    flair: undefined,
    pinnedPostIds: [],
    ...overrides,
  };
}

function relationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    state: FOLLOW_STATE.NONE,
    followedBy: false,
    blocking: false,
    muting: false,
    requested: false,
    requestedBy: false,
    ...overrides,
  };
}

function buildApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    target: 'patches.test:50051',
    getActor: vi.fn().mockResolvedValue({ actor: actor() }),
    getRelationship: vi.fn().mockResolvedValue({ relationship: relationship() }),
    followActor: vi.fn().mockResolvedValue({ relationship: relationship(), requested: false }),
    unfollowActor: vi.fn().mockResolvedValue({ relationship: relationship() }),
    acceptFollowRequest: vi.fn().mockResolvedValue({ relationship: relationship() }),
    rejectFollowRequest: vi.fn().mockResolvedValue({}),
    listActorPosts: vi.fn().mockResolvedValue({ posts: [], page: { hasMore: false, cursor: '' } }),
    ...overrides,
  } as unknown as PatchesApi;
}

describe('ProfileScreen follow-request awareness (§197.5)', () => {
  it('shows "follow requested" and cancels it with f when the viewer has an outstanding request', async () => {
    const unfollowActor = vi
      .fn()
      .mockResolvedValue({ relationship: relationship({ requested: false }) });
    const api = buildApi({
      getRelationship: vi
        .fn()
        .mockResolvedValue({ relationship: relationship({ requested: true }) }),
      unfollowActor,
    });
    const { lastFrame, stdin } = render(
      <ProfileScreen
        api={api}
        actorId="actor-2"
        knownActor={actor()}
        isActive
        actions={{}}
        viewerActorId="actor-1"
        ensureAccessToken={() => Promise.resolve('token')}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('follow requested'));
    stdin.write('f');
    await vi.waitFor(() =>
      expect(unfollowActor).toHaveBeenCalledWith({ actorId: 'actor-2' }, 'token'),
    );
  });

  it('shows the incoming-request line and accepts it with a', async () => {
    const acceptFollowRequest = vi
      .fn()
      .mockResolvedValue({ relationship: relationship({ requestedBy: false }) });
    const api = buildApi({
      getRelationship: vi
        .fn()
        .mockResolvedValue({ relationship: relationship({ requestedBy: true }) }),
      acceptFollowRequest,
    });
    const { lastFrame, stdin } = render(
      <ProfileScreen
        api={api}
        actorId="actor-2"
        knownActor={actor()}
        isActive
        actions={{}}
        viewerActorId="actor-1"
        ensureAccessToken={() => Promise.resolve('token')}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('wants to follow you'));
    stdin.write('a');
    await vi.waitFor(() =>
      expect(acceptFollowRequest).toHaveBeenCalledWith({ actorId: 'actor-2' }, 'token'),
    );
  });

  it('rejects an incoming request with x', async () => {
    const rejectFollowRequest = vi.fn().mockResolvedValue({});
    const getRelationship = vi
      .fn()
      .mockResolvedValue({ relationship: relationship({ requestedBy: true }) });
    const api = buildApi({ getRelationship, rejectFollowRequest });
    const { lastFrame, stdin } = render(
      <ProfileScreen
        api={api}
        actorId="actor-2"
        knownActor={actor()}
        isActive
        actions={{}}
        viewerActorId="actor-1"
        ensureAccessToken={() => Promise.resolve('token')}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('wants to follow you'));
    stdin.write('x');
    await vi.waitFor(() =>
      expect(rejectFollowRequest).toHaveBeenCalledWith({ actorId: 'actor-2' }, 'token'),
    );
  });

  it('toasts "follow request sent" when FollowActorResponse.requested comes back true', async () => {
    const onNotify = vi.fn();
    const followActor = vi
      .fn()
      .mockResolvedValue({ relationship: relationship({ requested: true }), requested: true });
    const api = buildApi({
      getRelationship: vi.fn().mockResolvedValue({ relationship: relationship() }),
      followActor,
    });
    const { lastFrame, stdin } = render(
      <ProfileScreen
        api={api}
        actorId="actor-2"
        knownActor={actor()}
        isActive
        actions={{}}
        viewerActorId="actor-1"
        ensureAccessToken={() => Promise.resolve('token')}
        onNotify={onNotify}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('not following'));
    stdin.write('f');
    await vi.waitFor(() =>
      expect(followActor).toHaveBeenCalledWith({ actorId: 'actor-2' }, 'token'),
    );
    await vi.waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith('Follow request sent.', 'success'),
    );
  });
});
