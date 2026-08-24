import type { PatchesApi } from '@patches/client';
import { ConversationSecurityMode, type Actor, type Conversation } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessagesRoute } from './MessagesRoute.js';

const mockListConversations =
  vi.fn<(...args: unknown[]) => Promise<{ conversations: Conversation[] }>>();
const mockUseSession = vi.fn<() => unknown>();

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

vi.mock('../components/ToastProvider.js', () => ({
  useToast: (): { pushToast: () => void } => ({ pushToast: () => undefined }),
}));

function conversation(
  id: string,
  handle: string,
  securityMode: ConversationSecurityMode,
): Conversation {
  return {
    id,
    securityMode,
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
    mockUseSession.mockReturnValue({
      actor: { id: 'actor-me', handle: 'allie' } as unknown as Actor,
    });
  });

  it('labels each conversation with the security mode the API reports (B-102)', async () => {
    mockListConversations.mockResolvedValue({
      conversations: [
        conversation('conv-e2ee', 'violet', ConversationSecurityMode.E2EE_V1),
        conversation('conv-legacy', 'legacyfriend', ConversationSecurityMode.LEGACY_SERVER_VISIBLE),
      ],
    });

    renderMessages();

    expect(await screen.findByText('@violet')).toBeInTheDocument();
    expect(screen.getByText('@legacyfriend')).toBeInTheDocument();
    expect(screen.getByText('E2EE')).toBeInTheDocument();
    expect(screen.getByText('Server-visible')).toBeInTheDocument();
  });

  it('keeps the route-level notice neutral while a mixed-mode list is shown', async () => {
    mockListConversations.mockResolvedValue({
      conversations: [
        conversation('conv-e2ee', 'violet', ConversationSecurityMode.E2EE_V1),
        conversation('conv-legacy', 'legacyfriend', ConversationSecurityMode.LEGACY_SERVER_VISIBLE),
      ],
    });

    renderMessages();

    await screen.findByText('@violet');
    const notice = screen.getByRole('note').textContent ?? '';
    expect(notice).not.toContain('Not end-to-end encrypted —');
    expect(notice).not.toContain('End-to-end encrypted.');
  });

  it('shows an empty state without inventing a mode when no conversations exist', async () => {
    mockListConversations.mockResolvedValue({ conversations: [] });

    renderMessages();

    expect(await screen.findByText('No conversations yet.')).toBeInTheDocument();
  });
});
