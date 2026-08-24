import { Code, ConnectError } from '@connectrpc/connect';
import type { PatchesApi } from '@patches/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PageRoute } from './PageRoute.js';

const mockGetPage = vi.fn<(...args: unknown[]) => Promise<object>>();
const mockGetActor = vi.fn<(...args: unknown[]) => Promise<{ actor?: object }>>();
const mockGetPost = vi.fn<(...args: unknown[]) => Promise<{ post?: object }>>();

vi.mock('../api/client.js', () => ({
  api: {
    pages: {
      getPage: (...args: unknown[]): Promise<object> => mockGetPage(...args),
    },
    actors: {
      getActor: (...args: unknown[]): Promise<{ actor?: object }> => mockGetActor(...args),
    },
    posts: {
      getPost: (...args: unknown[]): Promise<{ post?: object }> => mockGetPost(...args),
    },
  } as unknown as PatchesApi,
}));

vi.mock('../components/PostTimeline.js', () => ({
  PostTimeline: (): ReactElement => <div data-testid="posts-block" />,
}));

// PostCard drags in toast/lightbox machinery this route test doesn't exercise —
// stub it, keeping the pinned-strip assertions about which pins render.
vi.mock('../components/PostCard.js', () => ({
  PostCard: ({ post }: { post: { id: string } }): ReactElement => (
    <div data-testid={`pinned-${post.id}`} />
  ),
}));

/** A two-sub-page document: home carries every block kind under test, about exercises
 * sub-page tabs. The `javascript:` link exercises the parse-level degradation — a
 * bad-href Links block never reaches the renderer as links at all. */
function pageDocument(theme?: object): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      ...(theme === undefined ? {} : { theme }),
      pages: [
        {
          slug: 'home',
          title: 'Home',
          blocks: [
            { type: 'Text', body: 'welcome to my page' },
            { type: 'Links', links: [{ label: 'evil', href: 'javascript:alert(1)' }] },
          ],
        },
        { slug: 'about', title: 'About', blocks: [{ type: 'Text', body: 'about me' }] },
      ],
    }),
  );
}

function renderPage(path: string): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/page/:handle" element={<PageRoute />} />
          <Route path="/page/:handle/:slug" element={<PageRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

describe('PageRoute', () => {
  beforeEach(() => {
    mockGetPage.mockReset();
    mockGetActor.mockReset();
    mockGetPost.mockReset();
  });

  it('renders the index sub-page with sub-page tabs and a profile crumb', async () => {
    mockGetPage.mockResolvedValue({
      ownerActorId: 'actor-1',
      document: pageDocument(),
      activeSlug: 'home',
    });

    renderPage('/page/@allie');

    expect(await screen.findByText('welcome to my page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    const crumb = screen.getByRole('link', { name: '@allie' });
    expect(crumb).toHaveAttribute('href', '/@allie');
    const aboutTab = screen.getByRole('link', { name: 'About' });
    expect(aboutTab).toHaveAttribute('href', '/page/@allie/about');
  });

  it('never renders a javascript: link as an anchor', async () => {
    mockGetPage.mockResolvedValue({
      ownerActorId: 'actor-1',
      document: pageDocument(),
      activeSlug: 'home',
    });

    renderPage('/page/@allie');

    // parsePageForRender degrades the bad-href Links block to Unknown (§171's visible
    // placeholder) — the href is never in the DOM in any form.
    await screen.findByText('[Unknown block — not supported here yet]');
    expect(screen.queryByRole('link', { name: 'evil' })).toBeNull();
  });

  it('resolves a slug path to that sub-page', async () => {
    mockGetPage.mockResolvedValue({
      ownerActorId: 'actor-1',
      document: pageDocument(),
      activeSlug: 'about',
    });

    renderPage('/page/@allie/about');

    expect(await screen.findByText('about me')).toBeInTheDocument();
    expect(screen.queryByText('welcome to my page')).toBeNull();
  });

  it('shows a friendly empty state for a missing page', async () => {
    mockGetPage.mockRejectedValue(new ConnectError('page not found', Code.NotFound));

    renderPage('/page/@ghost');

    expect(await screen.findByText(/doesn't have a page here yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to their profile' })).toHaveAttribute(
      'href',
      '/@ghost',
    );
  });

  it('applies the document theme as page-scoped CSS variables and a border class', async () => {
    mockGetPage.mockResolvedValue({
      ownerActorId: 'actor-1',
      document: pageDocument({ accent: '#ff8800', background: '#101018', border: 'double' }),
      activeSlug: 'home',
    });

    const { container } = renderPage('/page/@allie');

    await screen.findByText('welcome to my page');
    const pageDiv = container.firstElementChild;
    expect(pageDiv).not.toBeNull();
    // React writes custom properties straight into the style attribute.
    expect(pageDiv?.getAttribute('style')).toContain('--page-accent: #ff8800');
    expect(pageDiv?.getAttribute('style')).toContain('--page-bg: #101018');
  });

  it('ignores a theme color that is not a plain color value', async () => {
    mockGetPage.mockResolvedValue({
      ownerActorId: 'actor-1',
      document: pageDocument({
        accent: 'url(https://evil.example/x) red',
        background: '#101018',
      }),
      activeSlug: 'home',
    });

    const { container } = renderPage('/page/@allie');

    await screen.findByText('welcome to my page');
    const style = container.firstElementChild?.getAttribute('style') ?? '';
    expect(style).not.toContain('url(');
    expect(style).toContain('--page-bg: #101018');
  });

  it('renders the owner\u2019s pinned posts above the sub-page blocks', async () => {
    mockGetPage.mockResolvedValue({
      ownerActorId: 'actor-1',
      document: pageDocument(),
      activeSlug: 'home',
    });
    mockGetActor.mockResolvedValue({ actor: { id: 'actor-1', pinnedPostIds: ['p1'] } });
    mockGetPost.mockResolvedValue({ post: { id: 'p1' } });

    renderPage('/page/@allie');

    await screen.findByText('welcome to my page');
    expect(await screen.findByTestId('pinned-p1')).toBeInTheDocument();
    expect(mockGetActor).toHaveBeenCalledWith({ id: 'actor-1' });
  });

  it('still renders the page when the pinned strip resolves to nothing', async () => {
    mockGetPage.mockResolvedValue({
      ownerActorId: 'actor-1',
      document: pageDocument(),
      activeSlug: 'home',
    });
    mockGetActor.mockResolvedValue({ actor: { id: 'actor-1', pinnedPostIds: [] } });

    renderPage('/page/@allie');

    expect(await screen.findByText('welcome to my page')).toBeInTheDocument();
    expect(screen.queryByLabelText(/pinned/i)).not.toBeInTheDocument();
  });
});
