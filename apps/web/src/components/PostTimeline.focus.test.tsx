import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { PostTimeline } from './PostTimeline.js';

vi.mock('./PostCard.js', () => ({
  PostCard: ({ post, focused }: { post: { id: string }; focused?: boolean }) => (
    <div data-testid="post" data-focused={focused === true}>
      {post.id}
    </div>
  ),
}));

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
});

describe('PostTimeline keyboard focus', () => {
  it('does not start with the first card focused, so `l` cannot like it by surprise', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      posts: [{ id: 'a' }, { id: 'b' }],
      page: { hasMore: false, nextCursor: '' },
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <PostTimeline queryKey={['t']} fetchPage={fetchPage} emptyMessage="empty" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const cards = await screen.findAllByTestId('post');
    expect(cards.map((c) => c.getAttribute('data-focused'))).toEqual(['false', 'false']);
  });
});
