import type { PatchesApi } from '@patches/client';
import { ConversationSecurityMode, type Actor, type Conversation } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WEB_E2EE_SESSION_UNAVAILABLE_COPY } from '../e2ee/availability.js';
import { MessagesRoute } from './MessagesRoute.js';

const mockListConversations =
  vi.fn<(...args: unknown[]) => Promise<{ conversations: Conversation[] }>>();
const mockUseSession = vi.fn<() => unknown>();
const mockToast = vi.fn<(...args: unknown[]) => void>();
const mockUseE2ee = vi.fn<() => { kind: string }>();

vi.mock('../api/client.js', () => ({
  api: {
    messages: {
      listConversations: (...args: unknown[]): Promise<{ conversations: Conversation[] }> =>
        mockListConversations(...args),
    },
  } as unknown as PatchesApi,
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('sonner', () => ({
  toast: (...args: unknown[]): void => mockToast(...args),
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

function renderMessages(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/messages']}>
        <MessagesRoute />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

describe('MessagesRoute', () => {
  beforeEach(() => {
    mockListConversations.mockReset();
    mockUseSession.mockReset();
    mockToast.mockReset();
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

  it('disables "New Message" while no session can be established (B-132)', async () => {
    mockListConversations.mockResolvedValue({ conversations: [] });

    renderMessages();
    await screen.findByText('No conversations yet.');

    const newMessage = screen.getByLabelText('New direct message');
    expect(newMessage).toBeDisabled();
    fireEvent.click(newMessage);
    // A disabled control must not pretend to have tried.
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('states plainly on the enrolled panel that messaging does not work here yet', async () => {
    mockListConversations.mockResolvedValue({ conversations: [] });
    renderMessages();
    await screen.findByText('No conversations yet.');

    expect(screen.getByText(WEB_E2EE_SESSION_UNAVAILABLE_COPY)).toBeInTheDocument();
  });

  it('offers enrollment without claiming it enables messaging', async () => {
    mockUseE2ee.mockReturnValue({ kind: 'not-enrolled' });
    mockListConversations.mockResolvedValue({ conversations: [] });

    renderMessages();
    await screen.findByText('No conversations yet.');

    expect(screen.getByLabelText('Enroll this browser as a messaging device')).toBeInTheDocument();
    expect(screen.getByText(WEB_E2EE_SESSION_UNAVAILABLE_COPY)).toBeInTheDocument();
  });
});
