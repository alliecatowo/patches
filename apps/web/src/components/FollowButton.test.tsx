import type { PatchesApi } from '@patches/client';
import { FollowState } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSession } from '../api/session.js';
import { FollowButton } from './FollowButton.js';

const mockGetRelationship = vi.fn<(...args: unknown[]) => Promise<object>>();
const mockFollowActor = vi.fn<(...args: unknown[]) => Promise<object>>();
const mockUnfollowActor = vi.fn<(...args: unknown[]) => Promise<object>>();

vi.mock('../api/client.js', () => ({
  api: {
    socialGraph: {
      getRelationship: (...args: unknown[]): Promise<object> => mockGetRelationship(...args),
      followActor: (...args: unknown[]): Promise<object> => mockFollowActor(...args),
      unfollowActor: (...args: unknown[]): Promise<object> => mockUnfollowActor(...args),
    },
  } as unknown as PatchesApi,
}));

vi.mock('../hooks/useSession.js', () => ({ useSession: vi.fn() }));
vi.mock('../hooks/useErrorToast.js', () => ({ useErrorToast: () => vi.fn() }));

const mockUseSession = vi.mocked((await import('../hooks/useSession.js')).useSession);

function signIn(actorId: string): void {
  mockUseSession.mockReturnValue({ actor: { id: actorId } } as unknown as AppSession);
}

function renderTree(element: ReactElement): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

describe('FollowButton', () => {
  beforeEach(() => {
    mockGetRelationship.mockReset();
    mockFollowActor.mockReset();
    mockUnfollowActor.mockReset();
    mockUseSession.mockReset();
  });

  it('follows and writes the relationship into the cache on success', async () => {
    signIn('viewer-1');
    mockGetRelationship.mockResolvedValue({ relationship: { state: FollowState.NONE } });
    mockFollowActor.mockResolvedValue({ relationship: { state: FollowState.FOLLOWING } });
    renderTree(<FollowButton actorId="actor-2" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Follow' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));

    await waitFor(() => expect(mockFollowActor).toHaveBeenCalled());
    const [request, options] = mockFollowActor.mock.calls[0] as [unknown, { signal: AbortSignal }];
    expect(request).toEqual({ actorId: 'actor-2' });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Following' })).toBeInTheDocument(),
    );
  });

  it('aborts the in-flight follow call on unmount instead of writing a stale cache entry', async () => {
    signIn('viewer-1');
    mockGetRelationship.mockResolvedValue({ relationship: { state: FollowState.NONE } });
    let capturedSignal: AbortSignal | undefined;
    mockFollowActor.mockImplementation(
      (...args: unknown[]) =>
        new Promise((_resolve, reject) => {
          const { signal } = args[1] as { signal: AbortSignal };
          capturedSignal = signal;
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const { unmount } = renderTree(<FollowButton actorId="actor-2" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Follow' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
    await waitFor(() => expect(mockFollowActor).toHaveBeenCalled());

    // Leaving the profile mid-toggle (e.g. a route change) must cancel the still-running
    // request rather than let a later resolution write a relationship for a button that
    // no longer exists (B-164).
    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });
});
