import type { PatchesApi } from '@patches/client';
import { ConversationSecurityMode, type Actor, type Conversation } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageThreadRoute } from './MessageThreadRoute.js';
import { PEER_SECURITY_POLL_MS } from '../e2ee/peer-security.js';

const mockGetConversation =
  vi.fn<(...args: unknown[]) => Promise<{ conversation?: Conversation }>>();
const mockListConversations =
  vi.fn<(...args: unknown[]) => Promise<{ conversations: Conversation[] }>>();
const mockToastError = vi.fn<(...args: unknown[]) => void>();
const mockUseSession = vi.fn<() => unknown>();
const mockUseE2ee = vi.fn<() => { kind: string }>();
/**
 * Peer root/roster served by the (mocked) node. A test reassigns these between the thread-open
 * baseline fetch and the next security poll so the hook observes a drift.
 */
let mockRoot: {
  identityRoot?: { generation: number; publicKey?: Uint8Array };
  identityChangedSinceAcknowledged: boolean;
};
let mockRoster: { roster?: { sequence: bigint; digest?: Uint8Array } };
const mockGetIdentityRoot = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetDeviceRoster = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('../api/client.js', () => ({
  api: {
    messages: {
      getConversation: (...args: unknown[]): Promise<{ conversation?: Conversation }> =>
        mockGetConversation(...args),
      listConversations: (...args: unknown[]): Promise<{ conversations: Conversation[] }> =>
        mockListConversations(...args),
    },
    e2ee: {
      getIdentityRoot: (...args: unknown[]): Promise<unknown> => mockGetIdentityRoot(...args),
      getDeviceRoster: (...args: unknown[]): Promise<unknown> => mockGetDeviceRoster(...args),
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
    .getAllByRole('note')
    .map((node) => node.textContent ?? '')
    .join(' ');
}

beforeEach(() => {
  mockGetConversation.mockReset();
  mockListConversations.mockReset();
  mockListConversations.mockResolvedValue({ conversations: [] });
  mockToastError.mockReset();
  mockUseSession.mockReset();
  mockUseE2ee.mockReset();
  mockUseSession.mockReturnValue({ actor: { id: 'actor-me', handle: 'allie' } });
  mockUseE2ee.mockReturnValue({ kind: 'enrolled' });
  mockGetIdentityRoot.mockReset();
  mockGetDeviceRoster.mockReset();
  mockRoot = {
    identityRoot: { generation: 3, publicKey: new Uint8Array([0xaa, 0xbb]) },
    identityChangedSinceAcknowledged: false,
  };
  mockRoster = { roster: { sequence: 7n, digest: new Uint8Array([0xcc, 0xdd]) } };
  mockGetIdentityRoot.mockImplementation(() => Promise.resolve(mockRoot));
  mockGetDeviceRoster.mockImplementation(() => Promise.resolve(mockRoster));
});

describe('MessageThreadRoute (B-132: the composer never promises what it cannot do)', () => {
  it('shows the conversation disclosure read off the wire', async () => {
    mockGetConversation.mockResolvedValue({ conversation: e2eeConversation('bob') });

    renderThread();

    await waitFor(() => {
      expect(noteText()).toContain('End-to-end encrypted.');
    });
  });

  it('disables the composer and explains why, with no retry promise', async () => {
    mockGetConversation.mockResolvedValue({ conversation: e2eeConversation('bob') });

    renderThread();

    await waitFor(() => {
      expect(noteText()).toContain('End-to-end encrypted.');
    });
    // ADR 0033/0035: the composer is live, and the old "use the terminal client" copy —
    // which was false even when it shipped, since the TUI was blocked by the same gap —
    // must be gone rather than reworded.
    expect(noteText()).not.toContain('does not work in the web client');
    expect(noteText()).not.toContain('Use the terminal client');
    expect(screen.getByRole('textbox', { name: 'Message body' })).toBeEnabled();
  });

  it('may now say the decrypted history is empty, because it can actually be read', async () => {
    // Under B-132 this string was forbidden: nothing could be decrypted, so "no messages
    // yet" would have been a lie dressed as an empty state. Sessions establish now, so an
    // empty thread really is empty and saying so is honest.
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

    expect(screen.queryByText(/End-to-end encrypted\./)).toBeNull();
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

describe('MessageThreadRoute peer-security send refusal (A-072)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses a send when the peer roster gains a device after the thread opened', async () => {
    vi.useFakeTimers();
    mockGetConversation.mockResolvedValue({ conversation: e2eeConversation('bob') });

    renderThread();

    // Let the open-time baseline settle; the composer is live (not yet refused).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('textbox', { name: 'Message body' })).toBeEnabled();

    // Between thread open and the next security poll, the peer enrols a new device (roster
    // sequence advances). The node's served roster moves, so the baseline catches it.
    mockRoster = { roster: { sequence: 8n, digest: new Uint8Array([0xcc, 0xdd]) } };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PEER_SECURITY_POLL_MS);
    });

    // The roster change is surfaced and a send is refused (never delivered as a message).
    expect(screen.getByRole('alert')).toHaveTextContent(/enrolled devices changed/);
    const textarea = screen.getByRole('textbox', { name: 'Message body' });
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('enrolled devices'));
    expect(screen.queryByText('hello')).toBeNull();
  });

  it('refuses a send when the peer identity root changed after the thread opened', async () => {
    vi.useFakeTimers();
    mockGetConversation.mockResolvedValue({ conversation: e2eeConversation('bob') });

    renderThread();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('textbox', { name: 'Message body' })).toBeEnabled();

    // The peer rotates their identity root between open and the next security poll.
    mockRoot = {
      identityRoot: { generation: 4, publicKey: new Uint8Array([0x11, 0x22]) },
      identityChangedSinceAcknowledged: false,
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PEER_SECURITY_POLL_MS);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/messaging identity changed/);
    const textarea = screen.getByRole('textbox', { name: 'Message body' });
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('messaging identity changed'),
    );
    expect(screen.queryByText('hello')).toBeNull();
  });
});
