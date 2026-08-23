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
  } as unknown as PatchesApi,
}));

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

function renderBlocks(blocks: RenderablePageBlock[], withContext = true): void {
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
  render(tree);
}

describe('PageBlocks', () => {
  beforeEach(() => {
    mockGetActorByHandle.mockReset();
    mockListGuestbook.mockReset();
    mockListActorPosts.mockReset();
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
        { type: 'Badges' },
        { type: 'Unknown', originalType: 'Future' },
      ],
      false,
    );

    expect(screen.getByText('Posts block — not supported here')).toBeInTheDocument();
    expect(screen.getByText('Top 8 — not supported here')).toBeInTheDocument();
    expect(screen.getByText('Guestbook — not supported here')).toBeInTheDocument();
    expect(screen.getByText('[Badges block — not supported here yet]')).toBeInTheDocument();
    expect(screen.getByText('[Unknown block — not supported here yet]')).toBeInTheDocument();
  });
});
