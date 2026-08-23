import type { PatchesApi } from '@patches/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PinnedPosts } from './PinnedPosts.js';

const mockGetActor = vi.fn<(...args: unknown[]) => Promise<{ actor?: object }>>();
const mockGetPost = vi.fn<(request: { id: string }) => Promise<{ post?: object }>>();

vi.mock('../api/client.js', () => ({
  api: {
    actors: {
      getActor: (...args: unknown[]) => mockGetActor(...args),
    },
    posts: {
      getPost: (request: { id: string }) => mockGetPost(request),
    },
  } as unknown as PatchesApi,
}));

// PostCard drags in the toast/keyboard/lightbox machinery — stub it, keeping this
// test about which pins resolve and render.
vi.mock('./PostCard.js', () => ({
  PostCard: ({ post }: { post: { id: string; body?: string } }): ReactElement => (
    <div data-testid={`post-${post.id}`}>{post.body}</div>
  ),
}));

function renderPinned(ownerActorId: string): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PinnedPosts ownerActorId={ownerActorId} />
    </QueryClientProvider>,
  );
}

describe('PinnedPosts', () => {
  it('resolves the owner\u2019s pinned ids in order and renders one card per pin', async () => {
    mockGetActor.mockResolvedValue({ actor: { id: 'actor-1', pinnedPostIds: ['p1', 'p2'] } });
    mockGetPost.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve({ post: { id, body: `body of ${id}` } }),
    );

    renderPinned('actor-1');

    expect(await screen.findByTestId('post-p1')).toBeInTheDocument();
    expect(screen.getByTestId('post-p2')).toBeInTheDocument();
    const first = screen.getByTestId('post-p1');
    expect(first.compareDocumentPosition(screen.getByTestId('post-p2'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(mockGetActor).toHaveBeenCalledWith({ id: 'actor-1' });
  });

  it('renders nothing when the owner has no pins', () => {
    mockGetActor.mockResolvedValue({ actor: { id: 'actor-1', pinnedPostIds: [] } });

    renderPinned('actor-1');

    expect(screen.queryByRole('region', { name: 'Pinned posts' })).not.toBeInTheDocument();
  });

  it('drops a pin that no longer resolves instead of failing the strip', async () => {
    mockGetActor.mockResolvedValue({ actor: { id: 'actor-1', pinnedPostIds: ['gone', 'kept'] } });
    mockGetPost.mockImplementation(({ id }: { id: string }) =>
      id === 'gone'
        ? Promise.reject(new Error('removed'))
        : Promise.resolve({ post: { id, body: 'kept body' } }),
    );

    renderPinned('actor-1');

    expect(await screen.findByTestId('post-kept')).toBeInTheDocument();
    expect(screen.queryByTestId('post-gone')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pinned posts' })).toBeInTheDocument();
  });

  it('renders nothing when the owner actor itself is gone', () => {
    mockGetActor.mockRejectedValue(new Error('no such actor'));

    renderPinned('actor-1');

    expect(screen.queryByRole('region', { name: 'Pinned posts' })).not.toBeInTheDocument();
  });
});
