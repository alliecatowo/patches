import { Code, ConnectError } from '@connectrpc/connect';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { PostTimeline, type PostPage } from './PostTimeline.js';

vi.mock('./PostCard.js', () => ({
  PostCard: ({ post }: { post: { id: string } }) => <div data-testid="post">{post.id}</div>,
}));

const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];

beforeAll(() => {
  class IO {
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
      observers.push(cb);
    }
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  }
  vi.stubGlobal('IntersectionObserver', IO);
});

function page(ids: string[], nextCursor?: string): PostPage {
  return {
    posts: ids.map((id) => ({ id })) as never,
    page: { hasMore: nextCursor !== undefined, nextCursor: nextCursor ?? '' } as never,
  };
}

function renderTimeline(
  fetchPage: (cursor: string) => Promise<PostPage>,
  retry: number | false = false,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry, retryDelay: 1 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PostTimeline queryKey={['t']} fetchPage={fetchPage} emptyMessage="empty" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PostTimeline', () => {
  it('shows a retryable error with a message when nothing could be loaded', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new ConnectError('x', Code.NotFound));
    renderTimeline(fetchPage);
    expect(await screen.findByText(/couldn.t load this timeline/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('rides out transient failures with query retries and then renders posts', async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new ConnectError('cold', Code.Unavailable))
      .mockRejectedValueOnce(new ConnectError('cold', Code.DeadlineExceeded))
      .mockResolvedValue(page(['a', 'b']));
    renderTimeline(fetchPage, 5);
    expect(await screen.findAllByTestId('post')).toHaveLength(2);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('keeps already-loaded posts when a later page fails, with an inline retry', async () => {
    let failNext = true;
    const fetchPage = vi.fn((cursor: string) => {
      if (cursor === '') return Promise.resolve(page(['a'], 'c1'));
      if (failNext) return Promise.reject(new ConnectError('boom', Code.NotFound));
      return Promise.resolve(page(['b']));
    });
    renderTimeline(fetchPage);
    expect(await screen.findAllByTestId('post')).toHaveLength(1);

    act(() => observers.at(-1)?.([{ isIntersecting: true }]));

    expect(await screen.findByText(/couldn.t load more posts/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load this timeline/i)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('post')).toHaveLength(1); // 'a' is still on screen

    failNext = false;
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
    await waitFor(() => expect(screen.getAllByTestId('post')).toHaveLength(2));
  });
});
