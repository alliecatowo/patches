import type { PatchesApi } from '@patches/client';
import { ConversationSecurityMode, type Actor, type Conversation } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WEB_DM_POLL_MS } from '../lib/poll-intervals.js';
import { DM_LIST_POLL_FAILED_COPY, MessagesRoute } from './MessagesRoute.js';

const mockListConversations =
  vi.fn<(...args: unknown[]) => Promise<{ conversations: Conversation[] }>>();
const mockGetActorByHandle = vi.fn<(...args: unknown[]) => Promise<{ actor?: Actor }>>();
const mockUseSession = vi.fn<() => unknown>();
const mockToast = vi.fn<(...args: unknown[]) => void>();
const mockToastError = vi.fn<(...args: unknown[]) => void>();
const mockUseE2ee = vi.fn<() => { kind: string }>();

vi.mock('../api/client.js', () => ({
  api: {
    messages: {
      listConversations: (...args: unknown[]): Promise<{ conversations: Conversation[] }> =>
        mockListConversations(...args),
    },
    actors: {
      getActorByHandle: (...args: unknown[]): Promise<{ actor?: Actor }> =>
        mockGetActorByHandle(...args),
    },
  } as unknown as PatchesApi,
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]): void => mockToast(...args), {
    error: (...args: unknown[]): void => mockToastError(...args),
  }),
}));

vi.mock('../e2ee/use-e2ee.js', () => ({
  useE2ee: () => mockUseE2ee(),
}));

function conversation(id: string, handle: string): Conversation {
  return {
    id,
    securityMode: ConversationSecurityMode.E2EE_V1,
    unreadCount: 0,
    members: [
      { actor: { id: 'actor-me', handle: 'allie' } as unknown as Actor },
      { actor: { id: `actor-${handle}`, handle } as unknown as Actor },
    ],
  } as unknown as Conversation;
}

function renderMessages(): { queryClient: QueryClient } & ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/messages']}>
        <MessagesRoute />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { queryClient, ...render(tree) };
}

describe('MessagesRoute', () => {
  beforeEach(() => {
    mockListConversations.mockReset();
    mockGetActorByHandle.mockReset();
    mockUseSession.mockReset();
    mockToast.mockReset();
    mockToastError.mockReset();
    mockUseE2ee.mockReset();
    mockUseE2ee.mockReturnValue({ kind: 'enrolled' });
    mockUseSession.mockReturnValue({
      actor: { id: 'actor-me', handle: 'allie' } as unknown as Actor,
    });
  });

  it('labels every conversation E2EE, since that is the only mode left (B-096)', async () => {
    mockListConversations.mockResolvedValue({
      conversations: [conversation('conv-e2ee', 'violet')],
    });

    renderMessages();

    expect(await screen.findByText('@violet')).toBeInTheDocument();
    expect(screen.getByText('E2EE')).toBeInTheDocument();
  });

  it('shows an empty state without inventing a mode when no conversations exist', async () => {
    mockListConversations.mockResolvedValue({ conversations: [] });

    renderMessages();

    expect(await screen.findByText('No conversations yet.')).toBeInTheDocument();
  });

  it('opens a minimal recipient/message composer from "New Message" once enrolled', async () => {
    mockListConversations.mockResolvedValue({ conversations: [] });

    renderMessages();
    await screen.findByText('No conversations yet.');

    const newMessage = screen.getByLabelText('New direct message');
    expect(newMessage).toBeEnabled();
    fireEvent.click(newMessage);

    expect(screen.getByLabelText('Recipient handle')).toBeInTheDocument();
    expect(screen.getByLabelText('First message')).toBeInTheDocument();
  });

  it('offers enrollment for a device that is not yet enrolled', async () => {
    mockUseE2ee.mockReturnValue({ kind: 'not-enrolled' });
    mockListConversations.mockResolvedValue({ conversations: [] });

    renderMessages();
    await screen.findByText('No conversations yet.');

    expect(screen.getByLabelText('Enroll this browser as a messaging device')).toBeInTheDocument();
  });

  it('polls the conversation list every WEB_DM_POLL_MS while mounted (ADR 0032, P19-021)', async () => {
    vi.useFakeTimers();
    try {
      mockListConversations.mockResolvedValue({ conversations: [] });
      renderMessages();

      await vi.waitFor(() => expect(mockListConversations).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(WEB_DM_POLL_MS);
      await vi.waitFor(() => expect(mockListConversations).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });

  it(
    'shows a failed refresh as failed, never as an empty inbox — the same house rule ' +
      'the badge and in-thread poll already keep (P19-017)',
    async () => {
      mockListConversations.mockResolvedValueOnce({
        conversations: [conversation('conv-e2ee', 'violet')],
      });
      const { queryClient } = renderMessages();
      expect(await screen.findByText('@violet')).toBeInTheDocument();

      mockListConversations.mockRejectedValueOnce(new Error('network down'));
      await queryClient.refetchQueries({ queryKey: ['conversations'] });

      // The stale-but-real conversation stays on screen, and the failure is stated —
      // it is never silently swallowed into "no conversations".
      expect(
        await screen.findByText(DM_LIST_POLL_FAILED_COPY, { exact: false }),
      ).toBeInTheDocument();
      expect(screen.getByText('@violet')).toBeInTheDocument();
      expect(screen.queryByText('No conversations yet.')).not.toBeInTheDocument();
    },
  );

  it('an empty list under a failed poll is worded as a failure, not as "no conversations yet"', async () => {
    mockListConversations.mockResolvedValueOnce({ conversations: [] });
    const { queryClient } = renderMessages();
    await screen.findByText('No conversations yet.');

    mockListConversations.mockRejectedValueOnce(new Error('network down'));
    await queryClient.refetchQueries({ queryKey: ['conversations'] });

    expect(await screen.findByText(DM_LIST_POLL_FAILED_COPY)).toBeInTheDocument();
    expect(screen.queryByText('No conversations yet.')).not.toBeInTheDocument();
  });
});
