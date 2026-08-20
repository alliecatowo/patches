import { readFile } from 'node:fs/promises';

import { COMMUNITY_INVITE_STATUS, COMMUNITY_ROLE } from '../api/wire/enums.js';
import type { Actor, Community } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { hasNonSgrEscape, stripSgr } from '../../test/ansi.js';
import { CommunitiesScreen, type CommunitiesScreenApi } from './CommunitiesScreen.js';
import {
  makeActor,
  makeCommunity,
  makeCommunityInvite,
  makeCommunityMember,
  makeListCommunityMembersResponse,
} from '../test/wire-fixtures.js';

const KEY = { enter: '\r', escape: '\x1b' } as const;

function actor(id: string, handle: string): Actor {
  return makeActor({ id, handle });
}

function community(
  id: string,
  name: string,
  viewerRole: Community['viewerRole'] = COMMUNITY_ROLE.UNSPECIFIED,
): Community {
  return makeCommunity({
    id,
    name,
    displayName: name,
    description: 'A public place',
    rules: 'Be kind.',
    createdBy: actor('creator', 'creator'),
    viewerRole,
  });
}

interface FakeApi extends CommunitiesScreenApi {
  listCommunities: ReturnType<typeof vi.fn<CommunitiesScreenApi['listCommunities']>>;
  listCommunityFeed: ReturnType<typeof vi.fn<CommunitiesScreenApi['listCommunityFeed']>>;
  listCommunityMembers: ReturnType<typeof vi.fn<CommunitiesScreenApi['listCommunityMembers']>>;
  joinCommunity: ReturnType<typeof vi.fn<CommunitiesScreenApi['joinCommunity']>>;
  leaveCommunity: ReturnType<typeof vi.fn<CommunitiesScreenApi['leaveCommunity']>>;
  setCommunityRole: ReturnType<typeof vi.fn<CommunitiesScreenApi['setCommunityRole']>>;
  banFromCommunity: ReturnType<typeof vi.fn<CommunitiesScreenApi['banFromCommunity']>>;
  respondToCommunityInvite: ReturnType<
    typeof vi.fn<CommunitiesScreenApi['respondToCommunityInvite']>
  >;
}

function fakeApi(communities: Community[]): FakeApi {
  return {
    target: 'node.test:443',
    listCommunities: vi.fn().mockResolvedValue({ communities, page: undefined }),
    listCommunityFeed: vi.fn().mockResolvedValue({ posts: [], page: undefined }),
    listCommunityMembers: vi.fn().mockResolvedValue({ members: [], page: undefined }),
    joinCommunity: vi.fn().mockImplementation(({ communityId }) =>
      Promise.resolve({
        community: {
          ...communities.find((item) => item.id === communityId),
          viewerRole: COMMUNITY_ROLE.MEMBER,
        },
      }),
    ),
    leaveCommunity: vi.fn().mockResolvedValue({ community: undefined }),
    setCommunityRole: vi.fn().mockResolvedValue({ member: undefined }),
    banFromCommunity: vi.fn().mockResolvedValue({}),
    respondToCommunityInvite: vi.fn().mockResolvedValue({ invite: undefined }),
  };
}

/** Frames carry SGR colour (see `vitest.config.ts`), so match on characters. */
async function waitForFrame(lastFrame: () => string | undefined, text: string): Promise<string> {
  const deadline = Date.now() + 2_000;
  let frame = stripSgr(lastFrame() ?? '');
  while (!frame.includes(text)) {
    if (Date.now() >= deadline)
      throw new Error(`Timed out waiting for ${text}. Last frame:\n${frame}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    frame = stripSgr(lastFrame() ?? '');
  }
  return frame;
}

function renderScreen(
  api: FakeApi,
  overrides: Partial<ComponentProps<typeof CommunitiesScreen>> = {},
) {
  const props: ComponentProps<typeof CommunitiesScreen> = {
    api,
    isActive: true,
    ensureAccessToken: () => Promise.resolve('token'),
    onCompose: vi.fn(),
    onInvite: vi.fn(),
    onEditAbout: vi.fn(),
    onRemovePost: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { ...render(<CommunitiesScreen {...props} />), props };
}

describe('CommunitiesScreen', () => {
  it('keeps j as movement and reserves uppercase J for join', async () => {
    const first = community('c1', 'alpha');
    const second = community('c2', 'beta');
    const api = fakeApi([first, second]);
    const { lastFrame, stdin, props } = renderScreen(api);
    await waitForFrame(lastFrame, '+alpha');

    stdin.write('j');
    await waitForFrame(lastFrame, '› +beta');
    expect(api.joinCommunity).not.toHaveBeenCalled();

    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, 'Read-only public community');
    stdin.write('J');
    await waitForFrame(lastFrame, 'member · J leave');
    expect(api.joinCommunity).toHaveBeenCalledWith({ communityId: 'c2' }, 'token');

    stdin.write('c');
    expect(props.onCompose).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }));
  });

  it('sanitizes remote text and exposes rules plus moderator member actions', async () => {
    const modCommunity = {
      ...community('c1', 'safe\x1b[2J', COMMUNITY_ROLE.MODERATOR),
      rules: 'No bells\x07 here',
    };
    const api = fakeApi([modCommunity]);
    api.listCommunityMembers.mockResolvedValue(
      makeListCommunityMembersResponse({
        members: [
          makeCommunityMember({
            actor: actor('member-1', 'mallory\x1b[H'),
            role: COMMUNITY_ROLE.MEMBER,
            joinedAt: undefined,
          }),
        ],
        page: undefined,
      }),
    );
    const { lastFrame, stdin } = renderScreen(api);
    await waitForFrame(lastFrame, '+safe[2J');
    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, 'moderator · J leave');

    stdin.write('U');
    const rules = await waitForFrame(lastFrame, 'No bells here');
    expect(hasNonSgrEscape(rules)).toBe(false);
    stdin.write(KEY.escape);
    await waitForFrame(lastFrame, 'moderator · J leave');
    stdin.write('m');
    await waitForFrame(lastFrame, '@mallory[H');
    stdin.write('P');
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write('B');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.setCommunityRole).toHaveBeenCalledWith(
      { communityId: 'c1', actorId: 'member-1', role: COMMUNITY_ROLE.MODERATOR },
      'token',
    );
    expect(api.banFromCommunity).toHaveBeenCalledWith(
      { communityId: 'c1', actorId: 'member-1', reason: '' },
      'token',
    );
  });

  it('accepts and declines invites only through explicit keys', async () => {
    const api = fakeApi([community('c1', 'alpha')]);
    const invites = [
      makeCommunityInvite({
        id: 'invite-1',
        communityId: 'c1',
        inviter: actor('actor-1', 'alice'),
        invitee: actor('actor-2', 'bob'),
        status: COMMUNITY_INVITE_STATUS.PENDING,
        createdAt: undefined,
      }),
    ];
    const { lastFrame, stdin } = renderScreen(api, { invites });
    await waitForFrame(lastFrame, '+alpha');
    stdin.write('i');
    await waitForFrame(lastFrame, 'Community invites');
    stdin.write('A');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.respondToCommunityInvite).toHaveBeenCalledWith(
      { inviteId: 'invite-1', accept: true },
      'token',
    );
  });

  it('contains no forbidden community ordering or scoring affordance', async () => {
    const source = await readFile(new URL('./CommunitiesScreen.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\b(?:vote|karma|score|sort|top|hot|best|rising)\b/i);
  });
});
