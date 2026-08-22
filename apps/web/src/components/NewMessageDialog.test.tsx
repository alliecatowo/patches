import type { PatchesApi } from '@patches/client';
import type { Actor } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewMessageDialog } from './NewMessageDialog.js';

const mockCreateConversation =
  vi.fn<(...args: unknown[]) => Promise<{ conversation?: { id: string } }>>();
const mockGetActorByHandle = vi.fn<(...args: unknown[]) => Promise<{ actor?: Actor }>>();

vi.mock('../api/client.js', () => ({
  api: {
    messages: {
      createConversation: (...args: unknown[]): Promise<{ conversation?: { id: string } }> =>
        mockCreateConversation(...args),
    },
    actors: {
      getActorByHandle: (...args: unknown[]): Promise<{ actor?: Actor }> =>
        mockGetActorByHandle(...args),
    },
  } as unknown as PatchesApi,
}));

vi.mock('./ToastProvider.js', () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function renderDialog(props: Parameters<typeof NewMessageDialog>[0]): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NewMessageDialog {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

describe('NewMessageDialog', () => {
  beforeEach(() => {
    mockCreateConversation.mockReset();
    mockGetActorByHandle.mockReset();
    mockCreateConversation.mockResolvedValue({ conversation: { id: 'conv-123' } });
  });

  it('renders nothing when closed', () => {
    const { container } = renderDialog({
      isOpen: false,
      onClose: vi.fn(),
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders with prefilled initial recipient and sends message', async () => {
    const onClose = vi.fn();
    renderDialog({
      isOpen: true,
      onClose,
      initialRecipient: {
        id: 'actor-violet',
        handle: 'violet',
        displayName: 'Violet',
      },
    });

    expect(screen.getByRole('dialog', { name: 'New Message' })).toBeInTheDocument();
    expect(screen.getByText('@violet')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText('Write your message…');
    fireEvent.change(textarea, { target: { value: 'Hey Violet, how are you?' } });

    const sendBtn = screen.getByRole('button', { name: 'Send' });
    expect(sendBtn).toBeEnabled();

    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(mockCreateConversation).toHaveBeenCalledTimes(1);
      expect(mockCreateConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientActorIds: ['actor-violet'],
          initialBody: 'Hey Violet, how are you?',
        }),
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
