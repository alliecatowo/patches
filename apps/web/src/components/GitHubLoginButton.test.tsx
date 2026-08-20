import type { PatchesApi } from '@patches/client';
import { GitHubLoginStatus } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Vitest hoists `vi.mock` above imports; a variable referenced inside the factory must be
// prefixed `mock` so the hoisting transform lifts it together with the mock call.
const mockBeginGitHubLogin = vi.fn();
const mockPollGitHubLogin = vi.fn();

vi.mock('../api/client.js', () => ({
  api: {
    auth: {
      beginGitHubLogin: mockBeginGitHubLogin,
      pollGitHubLogin: mockPollGitHubLogin,
    },
  } as unknown as PatchesApi,
  establishSession: vi.fn(),
}));

// Imported after the mock above so `GitHubLoginButton` picks up the mocked `../api/client.js`.
const { GitHubLoginButton } = await import('./GitHubLoginButton.js');
const { establishSession } = await import('../api/client.js');

function renderButton(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GitHubLoginButton />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

const BEGIN_RESPONSE = {
  deviceCode: 'device-123',
  userCode: 'ABCD-1234',
  verificationUri: 'https://github.com/login/device',
  interval: 5,
  expiresAt: undefined,
};

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('GitHubLoginButton (P15-005)', () => {
  afterEach(() => {
    vi.useRealTimers();
    mockBeginGitHubLogin.mockReset();
    mockPollGitHubLogin.mockReset();
    vi.mocked(establishSession).mockReset();
  });

  it('shows the device code and verification link, then completes on poll success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockBeginGitHubLogin.mockResolvedValue(BEGIN_RESPONSE);
    mockPollGitHubLogin
      .mockResolvedValueOnce({ status: GitHubLoginStatus.PENDING })
      .mockResolvedValueOnce({
        status: GitHubLoginStatus.COMPLETE,
        session: { actor: { id: 'u1' }, accessToken: 'a', refreshToken: 'r' },
      });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /sign in with github/i }));

    expect(await screen.findByText('ABCD-1234')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /github\.com\/login\/device/i })).toHaveAttribute(
      'href',
      'https://github.com/login/device',
    );

    await advance(5_000);
    expect(mockPollGitHubLogin).toHaveBeenCalledTimes(1);

    await advance(5_000);
    expect(mockPollGitHubLogin).toHaveBeenCalledTimes(2);

    await waitFor(() => expect(establishSession).toHaveBeenCalled());
  });

  it('backs the poll interval off by 5s on SLOW_DOWN', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockBeginGitHubLogin.mockResolvedValue(BEGIN_RESPONSE);
    mockPollGitHubLogin
      .mockResolvedValueOnce({ status: GitHubLoginStatus.SLOW_DOWN })
      .mockResolvedValueOnce({ status: GitHubLoginStatus.PENDING });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /sign in with github/i }));
    await screen.findByText('ABCD-1234');

    await advance(5_000);
    expect(mockPollGitHubLogin).toHaveBeenCalledTimes(1);

    // Still SLOW_DOWN-backed-off (5 + 5 = 10s), so the original 5s interval alone isn't enough.
    await advance(5_000);
    expect(mockPollGitHubLogin).toHaveBeenCalledTimes(1);

    await advance(5_000);
    expect(mockPollGitHubLogin).toHaveBeenCalledTimes(2);
  });

  it('shows a terminal message and resets to idle on EXPIRED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockBeginGitHubLogin.mockResolvedValue(BEGIN_RESPONSE);
    mockPollGitHubLogin.mockResolvedValueOnce({ status: GitHubLoginStatus.EXPIRED });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /sign in with github/i }));
    await screen.findByText('ABCD-1234');

    await advance(5_000);
    expect(await screen.findByText(/expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument();
  });

  it('shows a terminal message and resets to idle on DENIED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockBeginGitHubLogin.mockResolvedValue(BEGIN_RESPONSE);
    mockPollGitHubLogin.mockResolvedValueOnce({ status: GitHubLoginStatus.DENIED });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /sign in with github/i }));
    await screen.findByText('ABCD-1234');

    await advance(5_000);
    expect(await screen.findByText(/denied/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument();
  });

  it('stops polling once Cancel is clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockBeginGitHubLogin.mockResolvedValue(BEGIN_RESPONSE);
    mockPollGitHubLogin.mockResolvedValue({ status: GitHubLoginStatus.PENDING });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /sign in with github/i }));
    await screen.findByText('ABCD-1234');

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument();

    await advance(20_000);
    expect(mockPollGitHubLogin).not.toHaveBeenCalled();
  });
});
