import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { PatchesApi } from '@patches/client';
import type { Actor, Post } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSession } from '../api/session.js';
import { ThreadRoute } from './ThreadRoute.js';

const mockGetPost = vi.fn<(...args: unknown[]) => Promise<{ post?: Post }>>();
const mockListReplies =
  vi.fn<
    (
      ...args: unknown[]
    ) => Promise<{ posts: Post[]; page?: { hasMore: boolean; nextCursor: string } }>
  >();
const mockCreatePost = vi.fn<(...args: unknown[]) => Promise<{ post?: { id: string } }>>();
const mockUseSession = vi.fn<() => AppSession | null>();

vi.mock('../api/client.js', () => ({
  api: {
    posts: {
      getPost: (...args: unknown[]): Promise<{ post?: Post }> => mockGetPost(...args),
      listReplies: (
        ...args: unknown[]
      ): Promise<{ posts: Post[]; page?: { hasMore: boolean; nextCursor: string } }> =>
        mockListReplies(...args),
      createPost: (...args: unknown[]): Promise<{ post?: { id: string } }> =>
        mockCreatePost(...args),
    },
    node: {
      getNodeInfo: (): Promise<{ socialCapabilities: { maxPostChars: number } }> =>
        Promise.resolve({ socialCapabilities: { maxPostChars: 500 } }),
    },
  } as unknown as PatchesApi,
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('../components/ToastProvider.js', () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function renderThread(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/p/post-123']}>
        <Routes>
          <Route path="/p/:id" element={<ThreadRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

describe('ThreadRoute', () => {
  const mockPost: Post = {
    id: 'post-123',
    body: 'Root post in thread',
    createdAt: timestampFromDate(new Date()),
    author: {
      id: 'actor-1',
      handle: 'allie',
      displayName: 'Allie C',
      avatar: { url: '' },
      pinnedPostIds: [],
    } as unknown as Actor,
    labels: [],
    media: [],
    counts: { likes: 1, reposts: 0, replies: 0 },
    viewerState: { liked: false, reposted: false, bookmarked: false },
    repostedBy: [],
    repostedByTotal: 0,
    contentWarning: '',
    deleted: false,
  } as unknown as Post;

  beforeEach(() => {
    mockGetPost.mockReset();
    mockListReplies.mockReset();
    mockCreatePost.mockReset();
    mockUseSession.mockReset();

    mockGetPost.mockResolvedValue({ post: mockPost });
    mockListReplies.mockResolvedValue({
      posts: [],
      page: { hasMore: false, nextCursor: '' },
    });
  });

  it('renders root post and guest prompt when not signed in', async () => {
    mockUseSession.mockReturnValue(null);
    renderThread();

    expect(await screen.findByText('Root post in thread')).toBeInTheDocument();
    expect(screen.getByText(/Want to reply\?/i)).toBeInTheDocument();
  });

  it('renders inline reply composer when signed in and posts a reply', async () => {
    mockUseSession.mockReturnValue({
      actor: { id: 'actor-2', handle: 'bob', displayName: 'Bob' } as unknown as Actor,
    });
    mockCreatePost.mockResolvedValue({ post: { id: 'reply-1' } });

    renderThread();

    expect(await screen.findByText('Root post in thread')).toBeInTheDocument();
    expect(screen.getByText('Replying to @allie')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText('Post your reply…');
    fireEvent.change(textarea, { target: { value: 'This is my reply!' } });

    const replyBtn = screen.getByRole('button', { name: 'Reply' });
    expect(replyBtn).toBeEnabled();

    fireEvent.click(replyBtn);

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledTimes(1);
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'This is my reply!',
          inReplyToId: 'post-123',
        }),
      );
    });
  });
});
