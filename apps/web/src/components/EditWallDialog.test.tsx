import type { PatchesApi } from '@patches/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EditWallDialog } from './EditWallDialog.js';

const mockUpdatePage = vi.fn<(...args: unknown[]) => Promise<{ currentRevisionId: string }>>();

vi.mock('../api/client.js', () => ({
  api: {
    pages: {
      updatePage: (...args: unknown[]): Promise<{ currentRevisionId: string }> =>
        mockUpdatePage(...args),
    },
  } as unknown as PatchesApi,
}));

vi.mock('./ToastProvider.js', () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function renderDialog(props: Parameters<typeof EditWallDialog>[0]): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <EditWallDialog {...props} />
    </QueryClientProvider>
  );
  return render(tree);
}

describe('EditWallDialog', () => {
  beforeEach(() => {
    mockUpdatePage.mockReset();
    mockUpdatePage.mockResolvedValue({ currentRevisionId: 'rev-1' });
  });

  it('renders nothing when closed', () => {
    const { container } = renderDialog({
      isOpen: false,
      onClose: vi.fn(),
      handle: 'allie',
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('allows adding a text block and saving the wall', async () => {
    const onClose = vi.fn();
    renderDialog({
      isOpen: true,
      onClose,
      handle: 'allie',
    });

    expect(screen.getByRole('dialog', { name: 'Edit Profile Wall' })).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText('Write text or markdown for your wall...');
    fireEvent.change(textarea, { target: { value: 'Hello from my web wall!' } });

    fireEvent.click(screen.getByRole('button', { name: '+ Add Block' }));

    expect(screen.getByText('Hello from my web wall!')).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: 'Save Wall' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdatePage).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
