import { describe, expect, it } from 'vitest';

import { paginate } from './pagination.js';

interface FakePost {
  readonly id: string;
}

interface FakeListResponse {
  readonly posts: readonly FakePost[];
  readonly page: { readonly nextCursor: string; readonly hasMore: boolean };
}

describe('paginate', () => {
  it("walks every page in order, using each response's next_cursor as the next request", async () => {
    const pages: Record<string, FakeListResponse> = {
      '': { posts: [{ id: '1' }, { id: '2' }], page: { nextCursor: 'c2', hasMore: true } },
      c2: { posts: [{ id: '3' }], page: { nextCursor: 'c3', hasMore: true } },
      c3: { posts: [{ id: '4' }], page: { nextCursor: '', hasMore: false } },
    };
    const seenCursors: string[] = [];

    const items: FakePost[] = [];
    for await (const post of paginate<FakePost, FakeListResponse>(
      (cursor) => {
        seenCursors.push(cursor);
        const page = pages[cursor];
        if (page === undefined) throw new Error(`no fixture page for cursor ${cursor}`);
        return Promise.resolve(page);
      },
      (response) => response.posts,
    )) {
      items.push(post);
    }

    expect(items.map((p) => p.id)).toEqual(['1', '2', '3', '4']);
    expect(seenCursors).toEqual(['', 'c2', 'c3']);
  });

  it('stops after one page when hasMore is false, even with a non-empty cursor', async () => {
    const calls: string[] = [];
    const generator = paginate<FakePost, FakeListResponse>(
      (cursor) => {
        calls.push(cursor);
        return Promise.resolve({
          posts: [{ id: 'only' }],
          page: { nextCursor: 'ignored', hasMore: false },
        });
      },
      (response) => response.posts,
    );

    const items: FakePost[] = [];
    for await (const post of generator) items.push(post);

    expect(items).toHaveLength(1);
    expect(calls).toEqual(['']);
  });

  it('stops when there is no page info at all', async () => {
    const generator = paginate<FakePost, { posts: readonly FakePost[]; page?: undefined }>(
      () => Promise.resolve({ posts: [{ id: 'x' }], page: undefined }),
      (response) => response.posts,
    );

    const items: FakePost[] = [];
    for await (const post of generator) items.push(post);

    expect(items).toHaveLength(1);
  });

  it('passes the requested limit and start cursor through to the fetcher', async () => {
    let seen: { cursor: string; limit: number } | undefined;
    const generator = paginate<FakePost, FakeListResponse>(
      (cursor, limit) => {
        seen = { cursor, limit };
        return Promise.resolve({ posts: [], page: { nextCursor: '', hasMore: false } });
      },
      (response) => response.posts,
      { startCursor: 'resume-here', limit: 5 },
    );

    // `_post` is unused on purpose — draining the generator is what runs the fetch above.
    for await (const _post of generator) {
      void _post;
    }

    expect(seen).toEqual({ cursor: 'resume-here', limit: 5 });
  });
});
