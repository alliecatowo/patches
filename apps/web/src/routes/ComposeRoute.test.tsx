import type { PatchesApi } from '@patches/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreatePost = vi.fn();
const mockGetNodeInfo = vi.fn().mockResolvedValue({
  socialCapabilities: { maxPostChars: 500 },
});
const mockUploadMedia =
  vi.fn<(file: File, onProgress: (fraction: number) => void) => Promise<string>>();

vi.mock('../api/client.js', () => ({
  api: {
    posts: { createPost: mockCreatePost },
    node: { getNodeInfo: mockGetNodeInfo },
  } as unknown as PatchesApi,
}));

vi.mock('../lib/mediaUpload.js', () => ({
  uploadMedia: (file: File, onProgress: (fraction: number) => void): Promise<string> =>
    mockUploadMedia(file, onProgress),
}));

const { ComposeRoute } = await import('./ComposeRoute.js');

function renderCompose(initialEntry = '/compose'): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/compose" element={<ComposeRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

describe('ComposeRoute', () => {
  beforeAll(() => {
    // jsdom has no blob-URL implementation; the preview component needs both.
    Object.assign(URL, {
      createObjectURL: (): string => 'blob:test',
      revokeObjectURL: (): void => undefined,
    });
  });

  beforeEach(() => {
    window.localStorage.clear();
    mockCreatePost.mockReset();
    mockUploadMedia.mockReset();
  });

  it('restores draft text from localStorage on mount', () => {
    window.localStorage.setItem(
      'patches.web.draft.root',
      JSON.stringify({ body: 'Saved draft message', cwEnabled: false, contentWarning: '' }),
    );

    renderCompose();
    const textarea = screen.getByPlaceholderText("What's on your mind?");
    expect(textarea).toHaveValue('Saved draft message');
  });

  it('auto-saves typed text to localStorage', () => {
    renderCompose();
    const textarea = screen.getByPlaceholderText("What's on your mind?");

    fireEvent.change(textarea, { target: { value: 'New post in progress' } });

    const stored = window.localStorage.getItem('patches.web.draft.root');
    expect(stored).toContain('New post in progress');
  });

  it('inserts markdown syntax when format buttons are clicked', () => {
    renderCompose();
    const textarea = screen.getByPlaceholderText("What's on your mind?");
    const boldBtn = screen.getByTitle('Bold');

    fireEvent.click(boldBtn);
    expect(textarea).toHaveValue('****');
  });

  it('toggles content warning input field', () => {
    renderCompose();
    const cwBtn = screen.getByTitle('Toggle content warning');

    fireEvent.click(cwBtn);
    expect(screen.getByPlaceholderText('Content warning description…')).toBeInTheDocument();
  });

  it('resets the file input after picking so the same file can be re-picked', async () => {
    mockUploadMedia.mockResolvedValue('media-1');
    const view = renderCompose();

    const input = view.container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(['bytes'], 'shot.png', { type: 'image/png' });
    fireEvent.change(input as Element, { target: { files: [file] } });

    await waitFor(() => expect(mockUploadMedia).toHaveBeenCalledOnce());
    expect((input as HTMLInputElement).value).toBe('');
    // The upload tile rendered with a preview and no error state.
    expect(view.container.querySelector('img')).not.toBeNull();
    expect(screen.queryByText(/blocked before it reached storage/)).not.toBeInTheDocument();
  });

  it('surfaces the real upload error on the attachment tile', async () => {
    mockUploadMedia.mockRejectedValue(new Error('Upload failed (HTTP 403).'));
    const view = renderCompose();

    const input = view.container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input as Element, {
      target: { files: [new File(['bytes'], 'shot.png', { type: 'image/png' })] },
    });

    await screen.findByText(/HTTP 403/);
  });
});
