import type { PatchesApi } from '@patches/client';
import type { Actor } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

function renderLayout(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route path="*" element={<p>Route content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
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
  it('mounts exactly one persistent reporter chip for every route', () => {
    mockUseSession.mockReturnValue(null);
    renderLayout();

    const chips = screen.getAllByRole('button', { name: 'Report an issue' });
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveAttribute('title', 'Issue, jank, or idea — anything counts');
  });
});
