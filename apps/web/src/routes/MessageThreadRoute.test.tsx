import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { PatchesApi } from '@patches/client';
import { ConversationSecurityMode, type Actor, type Conversation } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageThreadRoute } from './MessageThreadRoute.js';

const mockGetConversation =
  vi.fn<(...args: unknown[]) => Promise<{ conversation?: Conversation }>>();
const mockListMessages =
  vi.fn<(...args: unknown[]) => Promise<{ messages: Array<Record<string, unknown>> }>>();
const mockUseSession = vi.fn<() => unknown>();

vi.mock('../api/client.js', () => ({
  api: {
    messages: {
      getConversation: (...args: unknown[]): Promise<{ conversation?: Conversation }> =>
        mockGetConversation(...args),
      listMessages: (...args: unknown[]): Promise<{ messages: Array<Record<string, unknown>> }> =>
        mockListMessages(...args),
      sendMessage: (): Promise<never> => Promise.reject(new Error('not used in these tests')),
    },
  } as unknown as PatchesApi,
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('../hooks/useErrorToast.js', () => ({
  useErrorToast:
    () =>
    (..._args: unknown[]): void =>
      undefined,
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

function conversationWithMode(securityMode: ConversationSecurityMode): Conversation {
  return { id: 'conv-1', securityMode } as unknown as Conversation;
}

describe('MessageThreadRoute disclosure', () => {
  beforeAll(() => {
    // jsdom implements no layout, so Element.scrollIntoView does not exist.
    Element.prototype.scrollIntoView = (): void => undefined;
  });

  beforeEach(() => {
    mockGetConversation.mockReset();
    mockListMessages.mockReset();
    mockUseSession.mockReset();

    mockListMessages.mockResolvedValue({ messages: [] });
    mockUseSession.mockReturnValue({
      actor: { id: 'actor-me', handle: 'allie' } as unknown as Actor,
    });
  });

  it('shows the terminal-client E2EE copy when the conversation reports E2EE_V1 (B-102)', async () => {
    mockGetConversation.mockResolvedValue({
      conversation: conversationWithMode(ConversationSecurityMode.E2EE_V1),
    });

    renderThread();

    await waitFor(() => {
      expect(screen.getByRole('note').textContent).toBe(
        "End-to-end encrypted. DMs live in the terminal client — this web view can't decrypt them.",
      );
    });
    // No crypto runtime on the web: the composer must not pretend it can send here.
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
  });

  it('keeps the mandated §183.1 notice for LEGACY_SERVER_VISIBLE conversations', async () => {
    mockGetConversation.mockResolvedValue({
      conversation: conversationWithMode(ConversationSecurityMode.LEGACY_SERVER_VISIBLE),
    });

    renderThread();

    await waitFor(() => {
      expect(screen.getByRole('note').textContent).toBe(
        "Not end-to-end encrypted — this node's operators can read these messages.",
      );
    });
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled();
  });

  it('asserts neither claim while the conversation has not loaded yet', () => {
    // Never settles: the notice must already be honest during the fetch.
    mockGetConversation.mockReturnValue(new Promise(() => undefined));

    renderThread();

    expect(screen.getByRole('note').textContent).not.toContain('Not end-to-end encrypted —');
    expect(screen.getByRole('note').textContent).not.toContain('End-to-end encrypted.');
  });

  it('renders plaintext bubbles only for legacy conversations and keeps the timestamp format', async () => {
    const createdAt = new Date('2026-08-23T12:00:00Z');
    mockGetConversation.mockResolvedValue({
      conversation: conversationWithMode(ConversationSecurityMode.LEGACY_SERVER_VISIBLE),
    });
    mockListMessages.mockResolvedValue({
      messages: [{ id: 'm1', body: 'hello there', createdAt: timestampFromDate(createdAt) }],
    });

    renderThread();

    expect(await screen.findByText('hello there')).toBeInTheDocument();
  });
});
