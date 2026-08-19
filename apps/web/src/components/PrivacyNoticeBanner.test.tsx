import type { PatchesApi } from '@patches/client';
import type { Actor, GetNodePolicyResponse, GetPrivacyPrefsResponse } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearActorSession, setActorSession } from '../api/session.js';

// Vitest hoists `vi.mock` above imports; a variable referenced inside the factory must be
// prefixed `mock` so the hoisting transform lifts it together with the mock call.
const mockGetNodePolicy = vi.fn<() => Promise<GetNodePolicyResponse>>();
const mockGetPrivacyPrefs = vi.fn<() => Promise<GetPrivacyPrefsResponse>>();

vi.mock('../api/client.js', () => ({
  api: {
    node: { getNodePolicy: mockGetNodePolicy },
    privacy: { getPrivacyPrefs: mockGetPrivacyPrefs },
  } as unknown as PatchesApi,
}));

// Imported after the mock above so `PrivacyNoticeBanner` picks up the mocked `../api/client.js`.
const { PrivacyNoticeBanner } = await import('./PrivacyNoticeBanner.js');

function renderBanner(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PrivacyNoticeBanner />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

// Only `actor.handle` would ever be read by anything downstream of `useSession` here — a full
// `Actor` fixture isn't worth constructing for a component that never renders the actor itself.
function fakeActor(): Actor {
  return { handle: 'alice' } as unknown as Actor;
}

describe('PrivacyNoticeBanner (A-053, spec §197.1)', () => {
  afterEach(() => {
    clearActorSession();
    mockGetNodePolicy.mockReset();
    mockGetPrivacyPrefs.mockReset();
  });

  it('renders nothing when signed out', () => {
    renderBanner();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mockGetNodePolicy).not.toHaveBeenCalled();
  });

  it('renders nothing once the acknowledged version matches the node’s current version', async () => {
    setActorSession(fakeActor());
    mockGetNodePolicy.mockResolvedValue({
      policy: { privacyNoticeVersion: 2 },
    } as unknown as GetNodePolicyResponse);
    mockGetPrivacyPrefs.mockResolvedValue({
      prefs: { privacyNoticeVersion: 2 },
    } as unknown as GetPrivacyPrefsResponse);

    renderBanner();
    await vi.waitFor(() => expect(mockGetNodePolicy).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('nudges toward /settings/privacy when the acknowledged version is stale', async () => {
    setActorSession(fakeActor());
    mockGetNodePolicy.mockResolvedValue({
      policy: { privacyNoticeVersion: 3 },
    } as unknown as GetNodePolicyResponse);
    mockGetPrivacyPrefs.mockResolvedValue({
      prefs: { privacyNoticeVersion: 1 },
    } as unknown as GetPrivacyPrefsResponse);

    renderBanner();

    expect(await screen.findByRole('status')).toHaveTextContent(/privacy notice changed/i);
    expect(screen.getByRole('link', { name: /review it/i })).toHaveAttribute(
      'href',
      '/settings/privacy',
    );
  });
});
