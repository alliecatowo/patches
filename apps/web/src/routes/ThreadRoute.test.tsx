import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { PatchesApi } from '@patches/client';
import type { Actor, Post } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
const mockUploadMedia =
  vi.fn<
    (
      file: File,
      onProgress: (fraction: number) => void,
      options?: { signal?: AbortSignal },
    ) => Promise<string>
  >();

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

vi.mock('../lib/mediaUpload.js', () => ({
  uploadMedia: (
    file: File,
    onProgress: (fraction: number) => void,
    options?: { signal?: AbortSignal },
  ): Promise<string> => mockUploadMedia(file, onProgress, options),
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
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
    mockUploadMedia.mockReset();

    mockGetPost.mockResolvedValue({ post: mockPost });
    mockListReplies.mockResolvedValue({
      posts: [],
      page: { hasMore: false, nextCursor: '' },
    });
  });

  beforeAll(() => {
    // jsdom has no blob-URL implementation; the preview component needs both.
    Object.assign(URL, {
      createObjectURL: (): string => 'blob:test',
      revokeObjectURL: (): void => undefined,
    });
  });

  it('renders root post and guest prompt when not signed in', async () => {
    mockUseSession.mockReturnValue(null);
    renderThread();

    expect(await screen.findByText('Root post in thread')).toBeInTheDocument();
    expect(screen.getByText(/Want to reply\?/i)).toBeInTheDocument();
  });

  it('shows the reply count heading and a permalink anchor per post', async () => {
    mockUseSession.mockReturnValue(null);
    mockGetPost.mockResolvedValue({
      post: { ...mockPost, counts: { likes: 1, reposts: 0, replies: 2 } } as unknown as Post,
    });
    const reply = { ...mockPost, id: 'reply-9', body: 'A nested reply' } as unknown as Post;
    mockListReplies.mockResolvedValue({
      posts: [reply],
      page: { hasMore: false, nextCursor: '' },
    });

    renderThread();

    expect(await screen.findByText('A nested reply')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2 replies' })).toBeInTheDocument();
    // Permalink anchors: the root wrapper and each reply wrapper carry the post id, so
    // `/p/<id>#<post-id>` fragments resolve.
    expect(document.getElementById('post-123')).not.toBeNull();
    expect(document.getElementById('reply-9')).not.toBeNull();
    // The reply chain is indented one visual level without nesting semantics — the
    // section exists and the reply article stays a direct sibling, not a list item.
    expect(screen.getByRole('region', { name: 'Replies' })).toBeInTheDocument();
    expect(document.querySelector('#reply-9 article')).not.toBeNull();
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

  it('targets a specific reply: composer header, preview, and inReplyToId (issue #154)', async () => {
    mockUseSession.mockReturnValue({
      actor: { id: 'actor-2', handle: 'bob', displayName: 'Bob' } as unknown as Actor,
    });
    mockCreatePost.mockResolvedValue({ post: { id: 'reply-1' } });
    const reply = {
      ...mockPost,
      id: 'reply-9',
      body: 'A nested reply',
      author: {
        ...mockPost.author,
        id: 'actor-3',
        handle: 'carol',
        displayName: 'Carol',
      } as unknown as Actor,
    } as unknown as Post;
    mockListReplies.mockResolvedValue({
      posts: [reply],
      page: { hasMore: false, nextCursor: '' },
    });

    renderThread();
    expect(await screen.findByText('A nested reply')).toBeInTheDocument();

    // Default: composer targets the root post.
    expect(screen.getByText('Replying to @allie')).toBeInTheDocument();

    // Click the reply action on the nested reply — it becomes the target.
    fireEvent.click(screen.getByRole('button', { name: /Reply to @carol/ }));
    expect(screen.getByText('Replying to @carol')).toBeInTheDocument();
    expect(screen.getByText(/Reply target/)).toBeInTheDocument();
    expect(screen.getByText(/@carol: A nested reply/)).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText('Post your reply…');
    fireEvent.change(textarea, { target: { value: 'Replying to carol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Replying to carol', inReplyToId: 'reply-9' }),
      );
    });

    // Target clears after a successful post — back to the root post.
    await waitFor(() => expect(screen.queryByText(/Reply target/)).not.toBeInTheDocument());
    expect(screen.getByText('Replying to @allie')).toBeInTheDocument();
  });

  it('cancels a reply target back to the root post (issue #154)', async () => {
    mockUseSession.mockReturnValue({
      actor: { id: 'actor-2', handle: 'bob', displayName: 'Bob' } as unknown as Actor,
    });
    const reply = {
      ...mockPost,
      id: 'reply-9',
      body: 'A nested reply',
      author: {
        ...mockPost.author,
        id: 'actor-3',
        handle: 'carol',
        displayName: 'Carol',
      } as unknown as Actor,
    } as unknown as Post;
    mockListReplies.mockResolvedValue({
      posts: [reply],
      page: { hasMore: false, nextCursor: '' },
    });

    renderThread();
    expect(await screen.findByText('A nested reply')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Reply to @carol/ }));
    expect(screen.getByText('Replying to @carol')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reply to the root post instead' }));
    expect(screen.getByText('Replying to @allie')).toBeInTheDocument();
    expect(screen.queryByText(/Reply target/)).not.toBeInTheDocument();
  });

  it('blocks submitting while an attachment upload is still in flight, then attaches it', async () => {
    mockUseSession.mockReturnValue({
      actor: { id: 'actor-2', handle: 'bob', displayName: 'Bob' } as unknown as Actor,
    });
    mockCreatePost.mockResolvedValue({ post: { id: 'reply-1' } });
    // Never-settling on purpose until the test resolves it below.
    let settleUpload: (mediaId: string) => void = (): void => undefined;
    mockUploadMedia.mockReturnValue(
      new Promise<string>((resolve) => {
        settleUpload = resolve;
      }),
    );

    const view = renderThread();
    expect(await screen.findByText('Root post in thread')).toBeInTheDocument();

    const input = view.container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input as Element, {
      target: { files: [new File(['bytes'], 'shot.png', { type: 'image/png' })] },
    });
    // The tile rendered with its progress overlay (progress starts at 0).
    await screen.findByText('0%');

    const textarea = screen.getByPlaceholderText('Post your reply…');
    fireEvent.change(textarea, { target: { value: 'With attachment' } });

    const replyBtn = screen.getByRole('button', { name: 'Reply' });
    expect(replyBtn).toBeDisabled();
    fireEvent.click(replyBtn);
    expect(mockCreatePost).not.toHaveBeenCalled();
    expect(screen.getByText('0%')).toBeInTheDocument(); // progress overlay visible

    settleUpload('media-9');
    await waitFor(() => expect(replyBtn).toBeEnabled());

    fireEvent.click(replyBtn);
    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({ mediaIds: ['media-9'] }),
      );
    });
  });

  it('passes an AbortSignal, and clicking cancel aborts it, drops the tile, and unblocks the reply button (B-172)', async () => {
    mockUseSession.mockReturnValue({
      actor: { id: 'actor-2', handle: 'bob', displayName: 'Bob' } as unknown as Actor,
    });
    let capturedSignal: AbortSignal | undefined;
    mockUploadMedia.mockImplementation(
      (_file, _onProgress, options) =>
        new Promise((_resolve, reject) => {
          capturedSignal = options?.signal;
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The media upload was aborted.', 'AbortError'));
          });
        }),
    );

    const view = renderThread();
    expect(await screen.findByText('Root post in thread')).toBeInTheDocument();

    const input = view.container.querySelector('input[type="file"]');
    fireEvent.change(input as Element, {
      target: { files: [new File(['bytes'], 'shot.png', { type: 'image/png' })] },
    });

    const cancelBtn = await screen.findByLabelText('Cancel upload');
    fireEvent.click(cancelBtn);

    expect(capturedSignal?.aborted).toBe(true);
    await waitFor(() => expect(view.container.querySelector('img')).toBeNull());
    expect(screen.queryByText(/Failed/i)).not.toBeInTheDocument();

    const textarea = screen.getByPlaceholderText('Post your reply…');
    fireEvent.change(textarea, { target: { value: 'No stuck attachment' } });
    expect(screen.getByRole('button', { name: 'Reply' })).toBeEnabled();
  });

  it('aborts any still-uploading attachment on unmount (B-172)', async () => {
    mockUseSession.mockReturnValue({
      actor: { id: 'actor-2', handle: 'bob', displayName: 'Bob' } as unknown as Actor,
    });
    let capturedSignal: AbortSignal | undefined;
    mockUploadMedia.mockImplementation(
      (_file, _onProgress, options) =>
        new Promise(() => {
          capturedSignal = options?.signal;
        }),
    );

    const view = renderThread();
    expect(await screen.findByText('Root post in thread')).toBeInTheDocument();

    const input = view.container.querySelector('input[type="file"]');
    fireEvent.change(input as Element, {
      target: { files: [new File(['bytes'], 'shot.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(capturedSignal).toBeDefined());

    view.unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
