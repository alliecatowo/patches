import { create } from '@bufbuild/protobuf';
import { ListTagFeedResponseSchema, SearchTagsResponseSchema } from '@patches/proto/es';
import type { Post, Tag } from '../api/wire/types.js';
import { describe, expect, it, vi } from 'vitest';

import type { CliIo } from './io.js';
import { runTag, type TagCommandApi } from './tag.js';
import { makeActor, makePageInfo, makePost, makeTag } from '../test/wire-fixtures.js';

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
  return makeTag({ id, name, displayName: name });
}

function post(): Post {
  return makePost({
    author: makeActor({ handle: 'alice\x1b[H' }),
    body: 'hello\x07 tag',
  });
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
    vi.mocked(api.searchTags).mockResolvedValue(
      create(SearchTagsResponseSchema, { tags: [tag('z', 'zebra'), tag('a', 'alpha\x1b[2J')] }),
    );
    const code = await runTag(['search', '#a', '--limit', '5'], { io, api, ...BASE });
    const output = io.out.join('');

    expect(code).toBe(0);
    expect(api.searchTags).toHaveBeenCalledWith({ query: 'a', cursor: '', limit: 5 });
    expect(output.indexOf('#alpha[2J')).toBeLessThan(output.indexOf('#zebra'));
  });

  it('reads a chronological feed page with an opaque cursor and sanitizes output', async () => {
    const io = makeIo();
    const api = fakeApi();
    vi.mocked(api.listTagFeed).mockResolvedValue(
      create(ListTagFeedResponseSchema, {
        posts: [post()],
        page: makePageInfo({ nextCursor: 'next', hasMore: true }),
      }),
    );
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
