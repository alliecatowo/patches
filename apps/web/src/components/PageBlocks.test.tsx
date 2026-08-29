import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { PatchesApi } from '@patches/client';
import type { RenderablePageBlock } from '@patches/domain';
import type { GuestbookEntry } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PageBlocks } from './PageBlocks.js';

const mockGetActorByHandle = vi.fn<(...args: unknown[]) => Promise<{ actor?: object }>>();
const mockListGuestbook = vi.fn<(...args: unknown[]) => Promise<{ entries: GuestbookEntry[] }>>();
const mockListActorPosts = vi.fn<(...args: unknown[]) => Promise<object>>();
const mockListMutualFollows = vi.fn<(...args: unknown[]) => Promise<{ actors: object[] }>>();
const mockGetMediaDownload = vi.fn<(...args: unknown[]) => Promise<{ downloadUrl?: string }>>();

vi.mock('../api/client.js', () => ({
  api: {
    actors: {
      getActorByHandle: (...args: unknown[]): Promise<{ actor?: object }> =>
        mockGetActorByHandle(...args),
    },
    pages: {
      listGuestbook: (...args: unknown[]): Promise<{ entries: GuestbookEntry[] }> =>
        mockListGuestbook(...args),
    },
    feeds: {
      listActorPosts: (...args: unknown[]): Promise<object> => mockListActorPosts(...args),
    },
    socialGraph: {
      listMutualFollows: (...args: unknown[]): Promise<{ actors: object[] }> =>
        mockListMutualFollows(...args),
    },
    media: {
      getMediaDownload: (...args: unknown[]): Promise<{ downloadUrl?: string }> =>
        mockGetMediaDownload(...args),
    },
  } as unknown as PatchesApi,
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: (): null => null,
}));

vi.mock('../hooks/useErrorToast.js', () => ({ useErrorToast: () => vi.fn() }));

// PostTimeline pulls in IntersectionObserver/pull-to-refresh machinery irrelevant to
// this component's wiring — stub it, capturing fetchPage so the Posts block's
// actor-id/limit plumbing is still asserted.
const capturedFetchPage = vi.fn<(cursor: string) => Promise<object>>();
vi.mock('./PostTimeline.js', () => ({
  PostTimeline: ({
    fetchPage,
  }: {
    fetchPage: (cursor: string) => Promise<object>;
  }): ReactElement => {
    capturedFetchPage.mockImplementation(fetchPage);
    return <div data-testid="posts-block" />;
  },
}));

function renderBlocks(
  blocks: RenderablePageBlock[],
  withContext = true,
): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PageBlocks
          blocks={blocks}
          context={
            withContext ? { handle: 'allie', slug: 'home', ownerActorId: 'actor-1' } : undefined
          }
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

describe('PageBlocks', () => {
  beforeEach(() => {
    mockGetActorByHandle.mockReset();
    mockListGuestbook.mockReset();
    mockListActorPosts.mockReset();
    mockListMutualFollows.mockReset();
    mockGetMediaDownload.mockReset();
    capturedFetchPage.mockReset();
  });

  it('renders a safe https link as an anchor and sanitizes text bodies', () => {
    renderBlocks([
      { type: 'Text', body: 'hello\x1b[31mred world' },
      { type: 'Links', links: [{ label: 'docs', href: 'https://example.com' }] },
    ]);

    expect(screen.getByText('hellored world')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer ugc');
  });

  it('renders a javascript: href as inert text, never an anchor', () => {
    renderBlocks([
      {
        type: 'Links',
        // Hand-built rather than document-parsed: parsePageForRender already degrades a
        // bad-href Links block to Unknown, so this asserts the renderer's own
        // defense-in-depth contract for callers that pass blocks from elsewhere.
        links: [{ label: 'evil', href: 'javascript:alert(1)' }],
      } as unknown as RenderablePageBlock,
    ]);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('evil')).toBeInTheDocument();
    expect(screen.getByText(/link removed/)).toBeInTheDocument();
  });

  it('renders grouped Links with one heading per contiguous group (B-119)', () => {
    renderBlocks([
      {
        type: 'Links',
        links: [
          { label: 'repo', href: 'https://git.test', group: 'Code' },
          { label: 'docs', href: 'https://docs.test', group: 'Code' },
          { label: 'blog', href: 'https://blog.test' },
          { label: 'wells', href: 'https://wells.test', group: 'Elsewhere' },
        ],
      },
    ]);

    // One heading per contiguous run; the flat entry sits outside any group.
    expect(screen.getByRole('heading', { level: 3, name: 'Code' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Elsewhere' })).toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 3, name: 'Code' })).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'repo' })).toHaveAttribute('href', 'https://git.test');
    expect(screen.getByRole('link', { name: 'blog' })).toHaveAttribute('href', 'https://blog.test');
  });

  it('renders a Posts block through the owner chronological feed', () => {
    mockListActorPosts.mockResolvedValue({ posts: [], page: { hasMore: false, nextCursor: '' } });
    renderBlocks([{ type: 'Posts', limit: 7 }]);

    expect(screen.getByTestId('posts-block')).toBeInTheDocument();
    void capturedFetchPage('');
    expect(mockListActorPosts).toHaveBeenCalledWith({
      actorId: 'actor-1',
      cursor: '',
      limit: 7,
    });
  });

  it('resolves TopEight local handles and marks remote refs', async () => {
    mockGetActorByHandle.mockResolvedValue({
      actor: { id: 'actor-2', handle: 'bob', displayName: 'Bob B' },
    });
    renderBlocks([{ type: 'TopEight', actors: ['@bob', '@far@away.example'] }]);

    const bob = await screen.findByRole('link', { name: /Bob B/ });
    expect(bob).toHaveAttribute('href', '/@bob');
    expect(screen.getByText('@far@away.example (remote)')).toBeInTheDocument();
  });

  it('renders a Friends block via the owner\u2019s mutual-follows list', async () => {
    mockListMutualFollows.mockResolvedValue({
      actors: [{ id: 'actor-2', handle: 'bob', displayName: 'Bob B' }],
    });
    renderBlocks([{ type: 'Friends', limit: 6 }]);

    const bob = await screen.findByRole('link', { name: /Bob B/ });
    expect(bob).toHaveAttribute('href', '/@bob');
    await waitFor(() =>
      expect(mockListMutualFollows).toHaveBeenCalledWith({
        actorId: 'actor-1',
        cursor: '',
        limit: 6,
      }),
    );
    expect(screen.getByText('Friends')).toBeInTheDocument();
  });

  it('shows the Friends empty state without inventing actors', async () => {
    mockListMutualFollows.mockResolvedValue({ actors: [] });
    renderBlocks([{ type: 'Friends' }]);

    expect(await screen.findByText('No mutual follows yet.')).toBeInTheDocument();
    // Default limit when the block omits one (TUI parity).
    expect(mockListMutualFollows).toHaveBeenCalledWith({
      actorId: 'actor-1',
      cursor: '',
      limit: 8,
    });
  });

  it('renders Gallery media through GetMediaDownload with its caption', async () => {
    mockGetMediaDownload.mockResolvedValue({ downloadUrl: 'https://r2.example/media-1.png' });
    const { container } = renderBlocks([
      { type: 'Gallery', mediaIds: ['3f2504e0-4f89-11d3-9a0c-0305e82c3301'], caption: 'my art' },
    ]);

    // alt="" marks the cell decorative, so query the element rather than the role.
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://r2.example/media-1.png');
    expect(mockGetMediaDownload).toHaveBeenCalledWith({
      mediaId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    });
    expect(screen.getByText('my art')).toBeInTheDocument();
  });

  it('renders guestbook entries newest-first as returned', async () => {
    mockListGuestbook.mockResolvedValue({
      entries: [
        {
          id: 'entry-1',
          author: { id: 'actor-2', handle: 'bob', displayName: 'Bob B' },
          body: 'nice page',
          createdAt: timestampFromDate(new Date()),
        } as unknown as GuestbookEntry,
      ],
    });
    renderBlocks([{ type: 'Guestbook' }]);

    expect(await screen.findByText('nice page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bob B' })).toHaveAttribute('href', '/@bob');
    // Signed out: the sign form and per-entry affordances stay hidden entirely.
    expect(screen.queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'report' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockListGuestbook).toHaveBeenCalledWith({
        handle: 'allie',
        slug: 'home',
        cursor: '',
        limit: 20,
      }),
    );
  });

  it('falls back to placeholders without a render context', () => {
    renderBlocks(
      [
        { type: 'Posts' },
        { type: 'TopEight', actors: [] },
        { type: 'Guestbook' },
        { type: 'Friends' },
        { type: 'Badges' },
        { type: 'Unknown', originalType: 'Future' },
      ],
      false,
    );

    expect(screen.getByText('Posts block — not supported here')).toBeInTheDocument();
    expect(screen.getByText('Top 8 — not supported here')).toBeInTheDocument();
    expect(screen.getByText('Guestbook — not supported here')).toBeInTheDocument();
    expect(screen.getByText('Friends — not supported here')).toBeInTheDocument();
    expect(screen.getByText('[Badges block — not supported here yet]')).toBeInTheDocument();
    expect(screen.getByText('[Unknown block — not supported here yet]')).toBeInTheDocument();
  });
});
