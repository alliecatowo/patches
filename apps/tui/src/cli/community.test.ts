import { COMMUNITY_ROLE } from '../api/wire/enums.js';
import type { Community, Post } from '../api/wire/types.js';
import { describe, expect, it, vi } from 'vitest';

import { runCommunity, type CommunityCommandApi } from './community.js';
import type { CliIo } from './io.js';

function community(viewerRole: Community['viewerRole'] = COMMUNITY_ROLE.UNSPECIFIED): Community {
  return {
    id: 'community-1',
    name: 'terminal',
    displayName: 'Terminal\x1b[2J people',
    description: '',
    rules: '',
    createdBy: undefined,
    isPublic: true,
    createdAt: undefined,
    updatedAt: undefined,
    counts: undefined,
    viewerRole,
  };
}

function makeIo(stdin = 'from stdin'): CliIo & { out: string[]; err: string[] } {
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
    readStdin: () => Promise.resolve(stdin),
  };
}

function fakeApi(): CommunityCommandApi {
  return {
    listCommunities: vi.fn().mockResolvedValue({ communities: [], page: undefined }),
    joinCommunity: vi.fn().mockResolvedValue({ community: community(COMMUNITY_ROLE.MEMBER) }),
    leaveCommunity: vi.fn().mockResolvedValue({ community: community() }),
    createPost: vi.fn().mockResolvedValue({ post: { id: 'post-1' } as Post }),
  };
}

const BASE = { env: {}, target: 'node.test:443', insecure: false } as const;

describe('runCommunity', () => {
  it('lists a keyset page and sanitizes remote fields', async () => {
    const io = makeIo();
    const api = fakeApi();
    vi.mocked(api.listCommunities).mockResolvedValue({
      communities: [community()],
      page: { nextCursor: 'opaque-next', hasMore: true },
    });
    const code = await runCommunity(['list', '--cursor', 'opaque', '--limit', '5'], {
      io,
      api,
      ...BASE,
    });

    expect(code).toBe(0);
    expect(api.listCommunities).toHaveBeenCalledWith({ cursor: 'opaque', limit: 5 });
    expect(io.out.join('')).toContain('Terminal[2J people');
    expect(io.out.join('')).toContain('next-cursor\topaque-next');
  });

  it('joins and leaves with an authenticated API call', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    expect(
      await runCommunity(['join', 'community-1'], {
        io,
        api,
        ensureAccessToken,
        ...BASE,
      }),
    ).toBe(0);
    expect(api.joinCommunity).toHaveBeenCalledWith({ communityId: 'community-1' }, 'token');

    expect(
      await runCommunity(['leave', 'community-1'], {
        io,
        api,
        ensureAccessToken,
        ...BASE,
      }),
    ).toBe(0);
    expect(api.leaveCommunity).toHaveBeenCalledWith({ communityId: 'community-1' }, 'token');
  });

  it('posts into the requested community from stdin', async () => {
    const io = makeIo('hello community');
    const api = fakeApi();
    const code = await runCommunity(['post', 'community-1'], {
      io,
      api,
      ensureAccessToken: () => Promise.resolve('token'),
      ...BASE,
    });

    expect(code).toBe(0);
    expect(api.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'hello community', communityId: 'community-1' }),
      'token',
    );
    expect(io.out.join('')).toContain('post-1');
  });

  it('rejects unknown subcommands without opening the API', async () => {
    const io = makeIo();
    expect(await runCommunity(['rank'], { io, api: fakeApi(), ...BASE })).toBe(1);
    expect(io.err.join('')).toContain('Unknown community subcommand');
  });
});
