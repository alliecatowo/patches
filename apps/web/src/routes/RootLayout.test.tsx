import type { PatchesApi } from '@patches/client';
import type { Actor } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSession } from '../api/session.js';

const mockGetUnreadCount = vi.fn();
const mockSignOut = vi.fn();
const mockUseSession = vi.fn<() => AppSession | null>();

vi.mock('../api/client.js', () => ({
  api: {
    notifications: { getUnreadCount: mockGetUnreadCount },
  } as unknown as PatchesApi,
  signOut: mockSignOut,
}));

vi.mock('../components/PrivacyNoticeBanner.js', () => ({
  PrivacyNoticeBanner: () => null,
}));

vi.mock('../hooks/useKeyboardShortcuts.js', () => ({
  useKeyboardShortcuts: () => undefined,
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: mockUseSession,
}));

const { RootLayout } = await import('./RootLayout.js');

function renderLayout(
  routeContent: ReactElement = <p>Route content</p>,
): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // `createMemoryRouter`/`RouterProvider` (matching `router.tsx`'s real object-route
  // shape, see `LazyRouteBoundary.test.tsx`) — a plain `<Routes><Route path="*" .../>`
  // splat child of an exact `path="/"` parent does not reliably render under this
  // react-router version, and the "closes More" test below navigates to `/register`,
  // so both the index (`/`) and a catch-all path need a matched child.
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <RootLayout />,
        children: [
          { index: true, element: routeContent },
          { path: '*', element: routeContent },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return render(tree);
}

function openMore(): HTMLElement {
  const button = screen.getByRole('button', { name: 'More' });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-expanded', 'true');
  return screen.getByLabelText('More destinations');
}

describe('RootLayout', () => {
  beforeEach(() => {
    vi.stubGlobal('__PATCHES_WEB_BUILT_AT__', '2026-08-22T00:00:00.000Z');
    vi.stubGlobal('__PATCHES_WEB_VERSION__', 'test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockGetUnreadCount.mockReset();
    mockSignOut.mockReset();
    mockUseSession.mockReset();
  });

  it('keeps the complete anonymous destination set reachable', () => {
    mockUseSession.mockReturnValue(null);
    renderLayout();

    const primary = screen.getByRole('navigation', { name: 'Primary' });
    for (const name of ['Home', 'Search', 'Compose', 'Notifications']) {
      expect(within(primary).getByRole('link', { name })).toBeInTheDocument();
    }

    const more = within(openMore());
    expect(more.getByRole('link', { name: 'Mod log' })).toHaveAttribute('href', '/moderation/log');
    expect(more.getByRole('link', { name: 'Report a problem' })).toHaveAttribute('href', '/report');
    expect(more.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(more.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
    expect(mockGetUnreadCount).not.toHaveBeenCalled();
  });

  it('exposes every signed-in secondary destination from More', () => {
    mockUseSession.mockReturnValue({
      actor: { id: 'actor-1', handle: 'allie' } as unknown as Actor,
    });
    mockGetUnreadCount.mockResolvedValue({ count: 0 });
    renderLayout();

    const more = within(openMore());
    const destinations = [
      ['Bookmarks', '/bookmarks'],
      ['Messages', '/messages'],
      ['Profile', '/@allie'],
      ['Settings', '/settings/profile'],
      ['Appeals', '/appeals'],
      ['Mod log', '/moderation/log'],
      ['Report a problem', '/report'],
    ] as const;

    for (const [name, href] of destinations) {
      expect(more.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(more.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('announces the unread notification count in the link name', async () => {
    mockUseSession.mockReturnValue({
      actor: { id: 'actor-1', handle: 'allie' } as unknown as Actor,
    });
    mockGetUnreadCount.mockResolvedValue({ count: 7 });
    renderLayout();

    expect(await screen.findByRole('link', { name: 'Notifications, 7 unread' })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });

  it('keeps the full TUI keymap discoverable in the responsive help dialog', () => {
    mockUseSession.mockReturnValue(null);
    renderLayout();

    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    for (const group of ['Navigation', 'Post actions', 'Create and search', 'Help']) {
      expect(screen.getByRole('heading', { name: group })).toBeInTheDocument();
    }
    for (const shortcut of ['j / ↓', 'l', 'c', '/', '?']) {
      expect(screen.getByText(shortcut, { selector: 'kbd' })).toBeInTheDocument();
    }
  });

  it('closes More after choosing a destination', () => {
    mockUseSession.mockReturnValue(null);
    renderLayout();

    const more = within(openMore());
    fireEvent.click(more.getByRole('link', { name: 'Register' }));

    expect(screen.queryByLabelText('More destinations')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false');
  });

  // B-112: reporting must be possible from every route, so the chip mounts exactly
  // once here in RootLayout — individual routes must not add a second one.
  it('does not mount a persistent reporter chip — reporting lives in the fan-out and /report (B-112 follow-up)', () => {
    renderLayout();
    expect(screen.queryByRole('button', { name: 'Report an issue' })).toBeNull();
  });

  // P301: RootLayout state unrelated to routing (the "More" menu toggle here stands in
  // for the unread-badge poll tick, both just flip RootLayout's own state) must not
  // re-render the matched route's element — see the `useMemo`-wrapped `<Outlet />` in
  // RootLayout.tsx. Without it every visible list row on the current route would
  // re-render on every 30s poll tick while idle.
  it('does not re-render the matched route element when only RootLayout-local state changes', () => {
    mockUseSession.mockReturnValue(null);
    let renderCount = 0;
    function RouteContent(): ReactElement {
      renderCount += 1;
      return <p>Route content</p>;
    }
    renderLayout(<RouteContent />);
    expect(screen.getByText('Route content')).toBeInTheDocument();
    expect(renderCount).toBe(1);

    openMore();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));

    expect(renderCount).toBe(1);
  });
});
