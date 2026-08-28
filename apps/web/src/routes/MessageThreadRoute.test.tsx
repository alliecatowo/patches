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
const mockToastError = vi.fn<(...args: unknown[]) => void>();
const mockUseSession = vi.fn<() => unknown>();
const mockUseE2ee = vi.fn<() => { kind: string }>();

vi.mock('../api/client.js', () => ({
  api: {
    messages: {
      getConversation: (...args: unknown[]): Promise<{ conversation?: Conversation }> =>
        mockGetConversation(...args),
    },
  } as unknown as PatchesApi,
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => mockToastError(...args), {
    error: (...args: unknown[]) => mockToastError(...args),
  }),
}));

vi.mock('../e2ee/use-e2ee.js', () => ({
  useE2ee: () => mockUseE2ee(),
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

function noteText(): string {
  return screen
    .queryAllByRole('note')
    .map((node) => node.textContent ?? '')
    .join(' ');
}

describe('MessageThreadRoute (B-132: the composer never promises what it cannot do)', () => {
  beforeEach(() => {
    mockGetConversation.mockReset();
    mockToastError.mockReset();
    mockUseSession.mockReset();
    mockUseE2ee.mockReset();
    mockUseSession.mockReturnValue({ actor: { id: 'actor-me', handle: 'allie' } });
    mockUseE2ee.mockReturnValue({ kind: 'enrolled' });
  });

  it('shows the conversation disclosure read off the wire', async () => {
    mockGetConversation.mockResolvedValue({ conversation: e2eeConversation('bob') });

    renderThread();

    await waitFor(() => {
      expect(noteText()).toContain('End-to-end encrypted.');
    });
  });

  it('enables the composer once enrolled — session setup works from the browser (ADR 0033 §7)', async () => {
    mockGetConversation.mockResolvedValue({ conversation: e2eeConversation('bob') });

    renderThread();

    await waitFor(() => {
      expect(noteText()).toContain('End-to-end encrypted.');
    });
    expect(screen.getByRole('textbox', { name: 'Message body' })).toBeEnabled();
    // Still disabled while the draft is empty, not because of an availability flag.
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('shows an honest empty state once loaded, enrolled, and no decrypted message has arrived yet', async () => {
    mockGetConversation.mockResolvedValue({ conversation: e2eeConversation('bob') });

    renderThread();

    await waitFor(() => {
      expect(noteText()).toContain('End-to-end encrypted.');
    });
    expect(screen.getByText('No decrypted messages yet on this device.')).toBeInTheDocument();
  });

  it('asserts nothing about the mode while the conversation has not loaded yet', () => {
    // Never settles: whatever renders during the fetch must already be honest.
    mockGetConversation.mockReturnValue(new Promise(() => undefined));

    renderThread();

    expect(noteText()).not.toContain('End-to-end encrypted.');
  });

  it('tells an un-enrolled browser what enrolling does, and does not overclaim', async () => {
    mockUseE2ee.mockReturnValue({ kind: 'not-enrolled' });
    mockGetConversation.mockResolvedValue({ conversation: e2eeConversation('bob') });

    renderThread();

    await waitFor(() => {
      expect(noteText()).toContain('enrolled as a messaging device');
    });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
