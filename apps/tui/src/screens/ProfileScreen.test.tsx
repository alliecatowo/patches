import type { Actor, Relationship } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { PlainModeProvider } from '../theme/plain-mode.js';
import { stripSgr } from '../../test/ansi.js';
import { NAME_TAG_STYLE, PROFILE_FRAME } from '../api/wire/enums.js';
import { ProfileScreen } from './ProfileScreen.js';
import { makeActor, makeRelationship } from '../test/wire-fixtures.js';

function actor(overrides: Partial<Actor> = {}): Actor {
  return makeActor({ id: 'actor-2', handle: 'bob', ...overrides });
}

function relationship(overrides: Partial<Relationship> = {}): Relationship {
  return makeRelationship(overrides);
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

describe('ProfileScreen rapid personalization (B-130)', () => {
  function renderScreen(theActor: Actor): { lastFrame: () => string | undefined } {
    // `useActor` always refetches and replaces `knownActor` once `getActor` resolves
    // (see its doc comment) — the mock must resolve to the same actor under test, or the
    // frame flips to `buildApi()`'s bare default fixture the instant that promise settles.
    return render(
      <ProfileScreen
        api={buildApi({ getActor: vi.fn().mockResolvedValue({ actor: theActor }) })}
        actorId={theActor.id}
        knownActor={theActor}
        isActive
        actions={{}}
      />,
    );
  }

  it('renders the frame border, name tag glyph, and nameplate-styled display name', async () => {
    const { lastFrame } = renderScreen(
      actor({
        displayName: 'Bob',
        profileFrame: PROFILE_FRAME.GRADIENT,
        nameTagStyle: NAME_TAG_STYLE.BADGE,
        accentColor: '#10B981',
        nameplate: {
          $typeName: 'patches.v1.Nameplate',
          nameColor: '#FF69B4',
          glyph: '✿',
          badges: [],
          avatarFrame: '',
          statusLine: '',
          profileBorder: '',
        },
      }),
    );
    // ANSI codes reset mid-token around the glyph/name, so the raw frame can't be
    // substring-matched directly — strip colour codes before every check here.
    await vi.waitFor(() => expect(stripSgr(lastFrame() ?? '')).toContain('✿ Bob ◆'));
    const frame = stripSgr(lastFrame() ?? '');
    // Name tag suffix glyph rides after the nameplate-styled display name.
    expect(frame).toContain('✿ Bob ◆');
    // A frame renders as an Ink box border ('bold' style for GRADIENT → ┏ corner).
    expect(frame).toContain('┏');
  });

  it('applies the deterministic identity-accent + restrained pop (B-117)', async () => {
    // No `accentColor` and no name-tag/frame cosmetics — the shared pack gives the profile
    // a handle-derived accent (so nothing falls back to the theme accent) and a restrained
    // pop dot after the name, both stripped under plain mode.
    const { lastFrame } = renderScreen(actor({ displayName: 'Bob' }));
    await vi.waitFor(() => expect(lastFrame()).toContain('Bob'));
    const frame = stripSgr(lastFrame() ?? '');
    // Pop is a single accent dot on the same name line (no extra row); name still intact.
    expect(frame).toContain('Bob ·');
  });

  it('degrades to a plain profile with no cosmetics set (§184.3)', async () => {
    const { lastFrame } = renderScreen(actor({ displayName: 'Bob' }));
    await vi.waitFor(() => expect(lastFrame()).toContain('Bob'));
    const frame = stripSgr(lastFrame() ?? '');
    expect(frame).not.toContain('◆');
    expect(frame).not.toContain('┌');
  });

  it('strips every decoration in plain mode even when cosmetics are set', async () => {
    const { lastFrame } = render(
      <PlainModeProvider plain>
        <ProfileScreen
          api={buildApi()}
          actorId="actor-2"
          knownActor={actor({
            displayName: 'Bob',
            profileFrame: PROFILE_FRAME.GLOW,
            nameTagStyle: NAME_TAG_STYLE.RIBBON,
            accentColor: '#10B981',
          })}
          isActive
          actions={{}}
        />
      </PlainModeProvider>,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('Bob'));
    const frame = stripSgr(lastFrame() ?? '');
    expect(frame).not.toContain('»');
    expect(frame).not.toContain('┌');
    // The name itself still renders — decoration stripped, content intact.
    expect(frame).toContain('Bob');
  });
});
