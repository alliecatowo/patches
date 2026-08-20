import type { PatchesApi } from '@patches/client';
import { OidcLoginStatus } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Vitest hoists `vi.mock` above imports; a variable referenced inside the factory must be
// prefixed `mock` so the hoisting transform lifts it together with the mock call.
const mockBeginOidcLogin = vi.fn();
const mockPollOidcLogin = vi.fn();

vi.mock('../api/client.js', () => ({
  api: {
    auth: {
      beginOidcLogin: mockBeginOidcLogin,
      pollOidcLogin: mockPollOidcLogin,
    },
  } as unknown as PatchesApi,
  establishSession: vi.fn(),
}));

// Imported after the mock above so `OidcLoginButton` picks up the mocked `../api/client.js`.
const { OidcLoginButton } = await import('./OidcLoginButton.js');
const { establishSession } = await import('../api/client.js');

const PROVIDER = {
  $typeName: 'patches.v1.OidcProviderInfo' as const,
  id: 'gitlab',
  displayName: 'GitLab',
};

function renderButton(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OidcLoginButton provider={PROVIDER} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

const BEGIN_RESPONSE = {
  deviceCode: 'device-123',
  userCode: 'ABCD-1234',
  verificationUri: 'https://gitlab.example/login/device',
  interval: 5,
  expiresAt: undefined,
};

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('OidcLoginButton (P15-006)', () => {
  afterEach(() => {
    vi.useRealTimers();
    mockBeginOidcLogin.mockReset();
    mockPollOidcLogin.mockReset();
    vi.mocked(establishSession).mockReset();
  });

  it('shows the device code for the given provider, then completes on poll success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockBeginOidcLogin.mockResolvedValue(BEGIN_RESPONSE);
    mockPollOidcLogin
      .mockResolvedValueOnce({ status: OidcLoginStatus.PENDING })
      .mockResolvedValueOnce({
        status: OidcLoginStatus.COMPLETE,
        session: { actor: { id: 'u1' }, accessToken: 'a', refreshToken: 'r' },
      });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /sign in with gitlab/i }));

    expect(await screen.findByText('ABCD-1234')).toBeInTheDocument();
    expect(mockBeginOidcLogin).toHaveBeenCalledWith({ provider: 'gitlab' });

    await advance(5_000);
    expect(mockPollOidcLogin).toHaveBeenCalledWith({
      provider: 'gitlab',
      deviceCode: 'device-123',
    });

    await advance(5_000);
    await waitFor(() => expect(establishSession).toHaveBeenCalled());
  });

  it('shows a terminal message and resets to idle on EXPIRED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockBeginOidcLogin.mockResolvedValue(BEGIN_RESPONSE);
    mockPollOidcLogin.mockResolvedValueOnce({ status: OidcLoginStatus.EXPIRED });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /sign in with gitlab/i }));
    await screen.findByText('ABCD-1234');

    await advance(5_000);
    expect(await screen.findByText(/expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with gitlab/i })).toBeInTheDocument();
  });
});
