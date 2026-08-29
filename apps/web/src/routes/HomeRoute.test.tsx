import type { PatchesApi } from '@patches/client';
import type { GetNodeInfoResponse } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearActorSession } from '../api/session.js';

// Vitest hoists `vi.mock` above imports; a variable referenced inside the factory must be
// prefixed `mock` so the hoisting transform lifts it together with the mock call.
const mockGetNodeInfo = vi.fn<() => Promise<GetNodeInfoResponse>>();
const mockListLocalFeed = vi.fn();
const mockListHomeFeed = vi.fn();

vi.mock('../api/client.js', () => ({
  api: {
    node: { getNodeInfo: mockGetNodeInfo },
    feeds: { listLocalFeed: mockListLocalFeed, listHomeFeed: mockListHomeFeed },
  } as unknown as PatchesApi,
}));

// Imported after the mock above so `HomeRoute` picks up the mocked `../api/client.js`.
const { HomeRoute } = await import('./HomeRoute.js');

function renderHome(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomeRoute />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

describe('HomeRoute (B-044)', () => {
  afterEach(() => {
    clearActorSession();
    mockGetNodeInfo.mockReset();
    mockListLocalFeed.mockReset();
    mockListHomeFeed.mockReset();
  });

  it('shows an invite-only panel and hides the "Everyone here" tab when signed out on a PUBLIC_READ=false node', async () => {
    mockGetNodeInfo.mockResolvedValue({ publicRead: false } as unknown as GetNodeInfoResponse);

    renderHome();

    expect(await screen.findByText(/this server is invite-only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /everyone here/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
    expect(mockListLocalFeed).not.toHaveBeenCalled();
  });

  it('shows the renamed "Everyone here" tab with its explainer when the node allows public reads', async () => {
    mockGetNodeInfo.mockResolvedValue({ publicRead: true } as unknown as GetNodeInfoResponse);
    mockListLocalFeed.mockResolvedValue({ posts: [], page: undefined });

    renderHome();

    expect(await screen.findByRole('button', { name: /everyone here/i })).toBeInTheDocument();
    expect(screen.getByText(/every public post on this server/i)).toBeInTheDocument();
    expect(screen.queryByText(/invite-only/i)).not.toBeInTheDocument();
  });
});
