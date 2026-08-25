import { Code, ConnectError } from '@connectrpc/connect';
import type { PatchesApi } from '@patches/client';
import type { Actor } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockGetActorByHandle = vi.fn();
const mockGetPage = vi.fn();
const mockUpdatePage = vi.fn();
const mockUseSession = vi.fn<() => { actor: { id: string } } | null>();

vi.mock('../api/client.js', () => ({
  api: {
    actors: { getActorByHandle: mockGetActorByHandle },
    pages: { getPage: mockGetPage, updatePage: mockUpdatePage },
  } as unknown as PatchesApi,
}));

vi.mock('../components/FollowButton.js', () => ({ FollowButton: () => null }));
vi.mock('../components/ModerationActions.js', () => ({ ModerationActions: () => null }));
vi.mock('../components/PageBlocks.js', () => ({ PageBlocks: () => null }));
vi.mock('../components/PostTimeline.js', () => ({ PostTimeline: () => null }));
vi.mock('../components/ToastProvider.js', () => ({
  useToast: (): { pushToast: () => void } => ({ pushToast: () => undefined }),
}));
vi.mock('../hooks/useSession.js', () => ({
  useSession: (): { actor: { id: string } } | null => mockUseSession(),
}));

const { ProfileRoute } = await import('./ProfileRoute.js');

function renderProfile(initialEntry = '/@allie'): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/:handle" element={<ProfileRoute />} />
          <Route path="/login" element={<p>Login route</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

describe('ProfileRoute', () => {
  afterEach(() => {
    mockGetActorByHandle.mockReset();
    mockGetPage.mockReset();
    mockUpdatePage.mockReset();
    mockUseSession.mockReset();
  });

  it('renders a profile returned by the node', async () => {
    mockGetActorByHandle.mockResolvedValue({
      actor: {
        id: 'actor-1',
        handle: 'allie',
        displayName: 'Allie',
        bio: '',
        locationText: '',
        websiteUrl: '',
      } as Actor,
    });

    renderProfile();

    expect(await screen.findByRole('heading', { name: 'Allie' })).toBeInTheDocument();
    expect(mockGetActorByHandle).toHaveBeenCalledWith({ handle: 'allie' });
  });

  it('uses account-not-found copy only for a genuine NOT_FOUND response', async () => {
    mockGetActorByHandle.mockRejectedValue(new ConnectError('Actor not found.', Code.NotFound));

    renderProfile();

    expect(await screen.findByText("This account doesn't exist.")).toBeInTheDocument();
  });

  it('shows an actionable sign-in prompt when a closed node rejects the read', async () => {
    const error = new ConnectError('Sign-in required.', Code.Unauthenticated);
    error.metadata.set('x-patches-error-code', 'SIGN_IN_REQUIRED');
    mockGetActorByHandle.mockRejectedValue(error);

    renderProfile();

    expect(await screen.findByRole('alert')).toHaveTextContent('This node requires sign-in');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/account doesn.t exist/i)).not.toBeInTheDocument();
  });

  it('surfaces transport failures instead of pretending the account is missing', async () => {
    mockGetActorByHandle.mockRejectedValue(new ConnectError('offline', Code.Unavailable));

    renderProfile();

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the Patches server");
    expect(screen.queryByText(/account doesn.t exist/i)).not.toBeInTheDocument();
  });

  it.each(['/allie', '/@', '/@@allie'])(
    'renders not found without an RPC for invalid profile path %s',
    (path) => {
      renderProfile(path);

      expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument();
      expect(mockGetActorByHandle).not.toHaveBeenCalled();
      expect(mockGetPage).not.toHaveBeenCalled();
    },
  );

  it('refetches the wall after saving even when the URL handle differs in case from the canonical handle', async () => {
    mockGetActorByHandle.mockResolvedValue({
      actor: {
        id: 'actor-1',
        handle: 'allie',
        displayName: 'Allie',
        bio: '',
        locationText: '',
        websiteUrl: '',
      } as Actor,
    });
    mockUseSession.mockReturnValue({ actor: { id: 'actor-1' } });
    mockGetPage.mockResolvedValue({
      ownerActorId: 'actor-1',
      document: new TextEncoder().encode(
        JSON.stringify({ version: 1, pages: [{ slug: 'home', title: 'Home', blocks: [] }] }),
      ),
    });
    mockUpdatePage.mockResolvedValue({});

    // Typed/pasted with different casing than the actor's canonically stored handle —
    // handle lookup is case-insensitive so this still resolves to the same actor.
    renderProfile('/@ALLIE');

    expect(await screen.findByRole('heading', { name: 'Allie' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Wall' }));

    await waitFor(() => expect(mockGetPage).toHaveBeenCalled());
    // Fetched (and thus cache-keyed) by the canonical handle, not the URL's casing.
    expect(mockGetPage).toHaveBeenLastCalledWith({ handle: 'allie', slug: '' });

    fireEvent.click(screen.getByRole('button', { name: '+ Edit Wall' }));
    expect(await screen.findByRole('dialog', { name: 'Edit Profile Wall' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Wall' }));

    await waitFor(() => expect(mockUpdatePage).toHaveBeenCalledTimes(1));
    // The post-save `invalidateQueries(['page', 'allie'])` must land on the same cache
    // entry this query used, or the wall shows stale content until a hard reload.
    await waitFor(() => expect(mockGetPage).toHaveBeenCalledTimes(2));
  });
});
