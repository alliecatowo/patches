import { Code, ConnectError } from '@connectrpc/connect';
import type { PatchesApi } from '@patches/client';
import { NameTagStyle, ProfileFrame, type Actor } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockGetActorByHandle = vi.fn();
const mockGetPage = vi.fn();
const mockUpdatePage = vi.fn();
const mockGetMediaDownload = vi.fn();
const mockUseSession = vi.fn<() => { actor: { id: string } } | null>();

vi.mock('../api/client.js', () => ({
  api: {
    actors: { getActorByHandle: mockGetActorByHandle },
    pages: { getPage: mockGetPage, updatePage: mockUpdatePage },
    media: { getMediaDownload: mockGetMediaDownload },
  } as unknown as PatchesApi,
}));

vi.mock('../components/FollowButton.js', () => ({ FollowButton: () => null }));
vi.mock('../components/ModerationActions.js', () => ({ ModerationActions: () => null }));
vi.mock('../components/PageBlocks.js', () => ({ PageBlocks: () => null }));
vi.mock('../components/PostTimeline.js', () => ({ PostTimeline: () => null }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
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
    mockGetMediaDownload.mockReset();
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
    // Degradation (§184.3): no banner set → no banner element at all.
    expect(document.querySelector('img')).toBeNull();
  });

  it('renders rapid personalization: frame and name tag (B-130)', async () => {
    mockGetActorByHandle.mockResolvedValue({
      actor: {
        id: 'actor-1',
        handle: 'allie',
        displayName: 'Allie',
        bio: '',
        locationText: '',
        websiteUrl: '',
        profileFrame: ProfileFrame.GLOW,
        nameTagStyle: NameTagStyle.PILLED,
        accentColor: '#10B981',
      } as Actor,
    });

    renderProfile();

    expect(await screen.findByRole('heading', { name: 'Allie' })).toBeInTheDocument();
    // Frame and name tag are data attributes on the existing structure — decoration only.
    expect(document.querySelector('[data-frame]')?.getAttribute('data-frame')).toBe('glow');
    expect(document.querySelector('[data-name-tag]')?.getAttribute('data-name-tag')).toBe('pilled');
  });

  it('renders deterministic identity art on a placeholder avatar (B-117)', async () => {
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

    await screen.findByRole('heading', { name: 'Allie' });

    // The avatar placeholder (no uploaded avatar) — CSS modules hash its class, so query by
    // the inline `--identity-accent` custom property the deterministic-art logic sets.
    const placeholder = document.querySelector<HTMLElement>('[style*="--identity-accent"]');
    expect(placeholder).not.toBeNull();
    // Deterministic, handle-derived accent + a closed allow-listed motif — decoration only.
    expect(placeholder?.style.getPropertyValue('--identity-accent')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(placeholder?.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    // A cap-less profile still gets the restrained pop by default (motion allowed).
    expect(document.querySelector('[data-pop]')?.getAttribute('data-pop')).toBe('true');
  });

  it('drops the pop emphasis when the user prefers reduced motion (B-117)', async () => {
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    mockGetActorByHandle.mockResolvedValue({
      actor: {
        id: 'actor-1',
        handle: 'allie',
        displayName: 'Allie',
        bio: '',
        locationText: '',
        websiteUrl: '',
        profileFrame: ProfileFrame.GLOW,
      } as Actor,
    });

    renderProfile();

    await screen.findByRole('heading', { name: 'Allie' });

    // Reduced motion only disables the animated pop, never the (static) frame.
    expect(document.querySelector('[data-pop]')).toBeNull();
    expect(document.querySelector('[data-frame]')?.getAttribute('data-frame')).toBe('glow');

    if (originalMatchMedia === undefined) {
      Reflect.deleteProperty(window, 'matchMedia');
    } else {
      Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    }
  });

  it('renders an uploaded avatar/banner via MediaService.GetMediaDownload (#324)', async () => {
    mockGetActorByHandle.mockResolvedValue({
      actor: {
        id: 'actor-1',
        handle: 'allie',
        displayName: 'Allie',
        bio: '',
        locationText: '',
        websiteUrl: '',
        avatar: { mediaId: 'avatar-media-1', url: '' },
        banner: { mediaId: 'banner-media-1', url: '' },
      } as Actor,
    });
    mockGetMediaDownload.mockImplementation(({ mediaId }: { mediaId: string }) =>
      Promise.resolve({ downloadUrl: `https://r2.example.com/${mediaId}` }),
    );

    renderProfile();

    expect(await screen.findByRole('heading', { name: 'Allie' })).toBeInTheDocument();
    await waitFor(() => {
      expect(
        document.querySelector('img[src="https://r2.example.com/avatar-media-1"]'),
      ).not.toBeNull();
      expect(
        document.querySelector('img[src="https://r2.example.com/banner-media-1"]'),
      ).not.toBeNull();
    });
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
