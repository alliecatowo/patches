import type { PatchesApi } from '@patches/client';
import { ConversationSecurityMode, type Actor, type Conversation } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageThreadRoute } from './MessageThreadRoute.js';

const mockGetConversation =
  vi.fn<(...args: unknown[]) => Promise<{ conversation?: Conversation }>>();

vi.mock('../api/client.js', () => ({
  api: {
    messages: {
      getConversation: (...args: unknown[]): Promise<{ conversation?: Conversation }> =>
        mockGetConversation(...args),
    },
  } as unknown as PatchesApi,
}));

function renderThread(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/messages/conv-1']}>
        <Routes>
          <Route path="/messages/:id" element={<MessageThreadRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

function e2eeConversation(handle: string): Conversation {
  return {
    id: 'conv-1',
    securityMode: ConversationSecurityMode.E2EE_V1,
    members: [
      {
        actor: { id: 'actor-peer', handle } as unknown as Actor,
        leftAt: undefined,
      },
    ],
  } as unknown as Conversation;
}

describe('MessageThreadRoute (B-096: E2EE-only, no plaintext content surface)', () => {
  beforeEach(() => {
    mockGetConversation.mockReset();
  });

  it('shows the accurate terminal-client disclosure and never renders a composer', async () => {
    mockGetConversation.mockResolvedValue({ conversation: e2eeConversation('bob') });

    renderThread();

    await waitFor(() => {
      expect(screen.getByRole('note').textContent).toContain('End-to-end encrypted.');
    });
    expect(screen.getByRole('note').textContent).toContain(
      'This web view has no key material to decrypt them',
    );
    // No plaintext RPC survives B-095: there must be no composer to type into.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
  });

  it('points at the conversation participant while opening in the terminal client', async () => {
    mockGetConversation.mockResolvedValue({ conversation: e2eeConversation('bob') });

    renderThread();

    expect(await screen.findByText(/@bob/)).toBeInTheDocument();
  });

  it('asserts nothing while the conversation has not loaded yet', () => {
    // Never settles: the notice must already be honest during the fetch.
    mockGetConversation.mockReturnValue(new Promise(() => undefined));

    renderThread();

    expect(screen.getByRole('note').textContent).not.toContain('End-to-end encrypted.');
  });
});
