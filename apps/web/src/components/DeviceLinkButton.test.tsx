import type { PatchesApi } from '@patches/client';
import { DeviceLinkStatus } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Vitest hoists `vi.mock` above imports; a variable referenced inside the factory must be
// prefixed `mock` so the hoisting transform lifts it together with the mock call.
const mockBeginDeviceLink = vi.fn();
const mockPollDeviceLink = vi.fn();

vi.mock('../api/client.js', () => ({
  api: {
    auth: {
      beginDeviceLink: mockBeginDeviceLink,
      pollDeviceLink: mockPollDeviceLink,
    },
  } as unknown as PatchesApi,
  establishSession: vi.fn(),
}));

// Imported after the mock above so `DeviceLinkButton` picks up the mocked `../api/client.js`.
const { DeviceLinkButton } = await import('./DeviceLinkButton.js');
const { establishSession } = await import('../api/client.js');

function renderButton(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DeviceLinkButton />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

const BEGIN_RESPONSE = {
  deviceCode: 'device-123',
  userCode: 'ABCD-1234',
  interval: 5,
  expiresAt: undefined,
};

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('DeviceLinkButton (P15-005)', () => {
  afterEach(() => {
    vi.useRealTimers();
    mockBeginDeviceLink.mockReset();
    mockPollDeviceLink.mockReset();
    vi.mocked(establishSession).mockReset();
  });

  it('shows the approve command, then completes on poll success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockBeginDeviceLink.mockResolvedValue(BEGIN_RESPONSE);
    mockPollDeviceLink
      .mockResolvedValueOnce({ status: DeviceLinkStatus.PENDING })
      .mockResolvedValueOnce({
        status: DeviceLinkStatus.COMPLETE,
        session: { actor: { id: 'u1' }, accessToken: 'a', refreshToken: 'r' },
      });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /approve from your terminal/i }));

    expect(await screen.findByText(/patches approve ABCD-1234/)).toBeInTheDocument();

    await advance(5_000);
    expect(mockPollDeviceLink).toHaveBeenCalledTimes(1);

    await advance(5_000);
    expect(mockPollDeviceLink).toHaveBeenCalledTimes(2);

    await waitFor(() => expect(establishSession).toHaveBeenCalled());
  });

  it('backs the poll interval off by 5s on SLOW_DOWN', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockBeginDeviceLink.mockResolvedValue(BEGIN_RESPONSE);
    mockPollDeviceLink
      .mockResolvedValueOnce({ status: DeviceLinkStatus.SLOW_DOWN })
      .mockResolvedValueOnce({ status: DeviceLinkStatus.PENDING });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /approve from your terminal/i }));
    await screen.findByText(/patches approve ABCD-1234/);

    await advance(5_000);
    expect(mockPollDeviceLink).toHaveBeenCalledTimes(1);

    // Still SLOW_DOWN-backed-off (5 + 5 = 10s), so the original 5s interval alone isn't enough.
    await advance(5_000);
    expect(mockPollDeviceLink).toHaveBeenCalledTimes(1);

    await advance(5_000);
    expect(mockPollDeviceLink).toHaveBeenCalledTimes(2);
  });

  it('shows a terminal message and resets to idle on EXPIRED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockBeginDeviceLink.mockResolvedValue(BEGIN_RESPONSE);
    mockPollDeviceLink.mockResolvedValueOnce({ status: DeviceLinkStatus.EXPIRED });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /approve from your terminal/i }));
    await screen.findByText(/patches approve ABCD-1234/);

    await advance(5_000);
    expect(await screen.findByText(/expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve from your terminal/i })).toBeInTheDocument();
  });

  it('stops polling once Cancel is clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockBeginDeviceLink.mockResolvedValue(BEGIN_RESPONSE);
    mockPollDeviceLink.mockResolvedValue({ status: DeviceLinkStatus.PENDING });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /approve from your terminal/i }));
    await screen.findByText(/patches approve ABCD-1234/);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('button', { name: /approve from your terminal/i })).toBeInTheDocument();

    await advance(20_000);
    expect(mockPollDeviceLink).not.toHaveBeenCalled();
  });
});
