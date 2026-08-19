import { POST_TYPE, POST_VISIBILITY, QUOTE_POLICY, type Post, type Tag } from '@patches/proto';
import { describe, expect, it, vi } from 'vitest';

import type { CliIo } from './io.js';
import { runTag, type TagCommandApi } from './tag.js';

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

function tag(id: string, name: string): Tag {
  return { id, name, displayName: name, createdAt: undefined };
}

function post(): Post {
  return {
    id: 'post-1',
    author: {
      id: 'actor-1',
      handle: 'alice\x1b[H',
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
    },
    body: 'hello\x07 tag',
    postType: POST_TYPE.NOTE,
    linkUrl: '',
    visibility: POST_VISIBILITY.PUBLIC,
    inReplyToId: '',
    rootPostId: 'post-1',
    media: [],
    createdAt: undefined,
    editedAt: undefined,
    deleted: false,
    counts: undefined,
    viewerState: undefined,
    contentWarning: '',
    quotedPost: undefined,
    community: undefined,
    quotePolicy: QUOTE_POLICY.UNSPECIFIED,
    repostedBy: [],
    repostedByTotal: 0,
    filteredBy: undefined,
    labels: [],
  };
}

function fakeApi(): TagCommandApi {
  return {
    searchTags: vi.fn().mockResolvedValue({ tags: [], page: undefined }),
    listTagFeed: vi.fn().mockResolvedValue({ posts: [], page: undefined }),
    muteTag: vi.fn().mockResolvedValue({}),
    unmuteTag: vi.fn().mockResolvedValue({}),
  };
}

const BASE = { env: {}, target: 'node.test:443', insecure: false } as const;

describe('runTag', () => {
  it('prints search results alphabetically even if the transport returns another order', async () => {
    const io = makeIo();
    const api = fakeApi();
    vi.mocked(api.searchTags).mockResolvedValue({
      tags: [tag('z', 'zebra'), tag('a', 'alpha\x1b[2J')],
      page: undefined,
    });
    const code = await runTag(['search', '#a', '--limit', '5'], { io, api, ...BASE });
    const output = io.out.join('');

    expect(code).toBe(0);
    expect(api.searchTags).toHaveBeenCalledWith({ query: 'a', cursor: '', limit: 5 });
    expect(output.indexOf('#alpha[2J')).toBeLessThan(output.indexOf('#zebra'));
  });

  it('reads a chronological feed page with an opaque cursor and sanitizes output', async () => {
    const io = makeIo();
    const api = fakeApi();
    vi.mocked(api.listTagFeed).mockResolvedValue({
      posts: [post()],
      page: { nextCursor: 'next', hasMore: true },
    });
    const code = await runTag(['feed', 'typescript', '--cursor', 'opaque'], {
      io,
      api,
      ...BASE,
    });

    expect(code).toBe(0);
    expect(api.listTagFeed).toHaveBeenCalledWith({
      tag: 'typescript',
      cursor: 'opaque',
      limit: 20,
    });
    expect(io.out.join('')).toContain('@alice[H\thello tag');
    expect(io.out.join('')).toContain('next-cursor\tnext');
  });

  it('mutes and unmutes by tag id with authentication', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    expect(await runTag(['mute', 'tag-1'], { io, api, ensureAccessToken, ...BASE })).toBe(0);
    expect(api.muteTag).toHaveBeenCalledWith({ tagId: 'tag-1' }, 'token');

    expect(await runTag(['unmute', 'tag-1'], { io, api, ensureAccessToken, ...BASE })).toBe(0);
    expect(api.unmuteTag).toHaveBeenCalledWith({ tagId: 'tag-1' }, 'token');
  });
});
