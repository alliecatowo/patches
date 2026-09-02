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

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
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

  it('syncs the block list once the page document arrives after the dialog is already open', async () => {
    const doc = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        pages: [
          { slug: 'home', title: 'Home', blocks: [{ type: 'Text', body: 'existing wall text' }] },
        ],
      }),
    );

    const { rerender } = renderDialog({
      isOpen: true,
      onClose: vi.fn(),
      handle: 'allie',
      currentDocument: undefined,
    });

    expect(screen.queryByText('existing wall text')).not.toBeInTheDocument();

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <EditWallDialog isOpen={true} onClose={vi.fn()} handle="allie" currentDocument={doc} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('existing wall text')).toBeInTheDocument();
  });

  it('preserves other sub-pages and the theme when saving the wall unchanged', async () => {
    const doc = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        theme: { accent: '#ff00ff' },
        pages: [
          { slug: 'landing', title: 'Landing', blocks: [{ type: 'Text', body: 'wall text' }] },
          { slug: 'about', title: 'About', blocks: [{ type: 'Text', body: 'about me' }] },
        ],
      }),
    );

    renderDialog({
      isOpen: true,
      onClose: vi.fn(),
      handle: 'allie',
      currentDocument: doc,
    });

    expect(await screen.findByText('wall text')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Wall' }));

    await waitFor(() => {
      expect(mockUpdatePage).toHaveBeenCalledTimes(1);
    });

    const [request] = mockUpdatePage.mock.calls[0] as [{ document: Uint8Array }];
    const saved = JSON.parse(new TextDecoder().decode(request.document)) as {
      theme?: { accent?: string };
      pages: { slug: string; title: string }[];
    };

    expect(saved.theme).toEqual({ accent: '#ff00ff' });
    expect(saved.pages).toHaveLength(2);
    expect(saved.pages[0]).toMatchObject({ slug: 'landing', title: 'Landing' });
    expect(saved.pages[1]).toMatchObject({ slug: 'about', title: 'About' });
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

  it('provides a descriptive aria-label on block remove buttons', async () => {
    const doc = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        pages: [
          {
            slug: 'home',
            title: 'Home',
            blocks: [
              { type: 'Text', body: 'First text block' },
              { type: 'NowPlaying', text: 'Daft Punk' },
            ],
          },
        ],
      }),
    );

    renderDialog({
      isOpen: true,
      onClose: vi.fn(),
      handle: 'allie',
      currentDocument: doc,
    });

    expect(
      await screen.findByRole('button', { name: 'Remove Text block: First text block' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove NowPlaying block: ♪ Daft Punk' }),
    ).toBeInTheDocument();
  });
});
