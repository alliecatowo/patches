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
  vi.fn<
    (
      file: File,
      onProgress: (fraction: number) => void,
      options?: { signal?: AbortSignal },
    ) => Promise<string>
  >();
const mockSearchActors = vi.fn().mockResolvedValue({ actors: [], page: undefined });
const mockListFollowing = vi.fn().mockResolvedValue({ actors: [], page: undefined });
const mockGetRelationship = vi.fn().mockResolvedValue({ relationship: undefined });

vi.mock('../api/client.js', () => ({
  api: {
    posts: { createPost: mockCreatePost },
    node: { getNodeInfo: mockGetNodeInfo },
    actors: { searchActors: mockSearchActors, listFollowing: mockListFollowing },
    socialGraph: { getRelationship: mockGetRelationship },
  } as unknown as PatchesApi,
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: () => ({ actor: { id: 'viewer-1', handle: 'viewer' } }),
}));

vi.mock('../lib/mediaUpload.js', () => ({
  uploadMedia: (
    file: File,
    onProgress: (fraction: number) => void,
    options?: { signal?: AbortSignal },
  ): Promise<string> => mockUploadMedia(file, onProgress, options),
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
    mockSearchActors.mockReset().mockResolvedValue({ actors: [], page: undefined });
    mockListFollowing.mockReset().mockResolvedValue({ actors: [], page: undefined });
    mockGetRelationship.mockReset().mockResolvedValue({ relationship: undefined });
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

  it('toggles content warning input field and updates aria-pressed', () => {
    renderCompose();
    const cwBtn = screen.getByRole('button', { name: 'Toggle content warning' });
    expect(cwBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(cwBtn);
    expect(screen.getByPlaceholderText('Content warning description…')).toBeInTheDocument();
    expect(cwBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('provides accessible ARIA labels for all toolbar format buttons', () => {
    renderCompose();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quote' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mention' })).toBeInTheDocument();
  });

  it('shows @-mention suggestions only after an explicit @ prefix and inserts the handle on select (§219)', async () => {
    mockListFollowing.mockResolvedValue({
      actors: [{ id: 'a1', handle: 'alice', displayName: 'Alice', avatar: undefined }],
      page: undefined,
    });
    renderCompose();
    const textarea = screen.getByPlaceholderText("What's on your mind?");

    // A bare word never triggers the dropdown.
    fireEvent.change(textarea, { target: { value: 'hello al' } });
    fireEvent.click(textarea);
    expect(screen.queryByRole('listbox', { name: 'Mention suggestions' })).not.toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'hello @al', selectionStart: 9 } });
    (textarea as HTMLTextAreaElement).setSelectionRange(9, 9);
    fireEvent.click(textarea);

    await waitFor(() => {
      expect(screen.getByRole('listbox', { name: 'Mention suggestions' })).toBeInTheDocument();
    });
    expect(screen.getByText('@alice')).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(textarea).toHaveValue('hello @alice ');
  });

  it('drops a blocked/muted actor from mention suggestions (§219)', async () => {
    mockListFollowing.mockResolvedValue({
      actors: [{ id: 'a1', handle: 'alice', displayName: 'Alice', avatar: undefined }],
      page: undefined,
    });
    mockGetRelationship.mockResolvedValue({
      relationship: { state: 0, followedBy: false, blocking: true, muting: false },
    });
    renderCompose();
    const textarea = screen.getByPlaceholderText("What's on your mind?");

    fireEvent.change(textarea, { target: { value: '@al' } });
    (textarea as HTMLTextAreaElement).setSelectionRange(3, 3);
    fireEvent.click(textarea);

    await waitFor(() => {
      expect(mockGetRelationship).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('listbox', { name: 'Mention suggestions' }),
      ).not.toBeInTheDocument();
    });
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

  it('passes an AbortSignal, and clicking cancel aborts it and drops the tile without an error (B-172)', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockUploadMedia.mockImplementation(
      (_file, _onProgress, options) =>
        new Promise((_resolve, reject) => {
          capturedSignal = options?.signal;
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The media upload was aborted.', 'AbortError'));
          });
        }),
    );
    const view = renderCompose();

    const input = view.container.querySelector('input[type="file"]');
    fireEvent.change(input as Element, {
      target: { files: [new File(['bytes'], 'shot.png', { type: 'image/png' })] },
    });

    const cancelBtn = await screen.findByLabelText('Cancel upload');
    expect(capturedSignal?.aborted).toBe(false);
    fireEvent.click(cancelBtn);

    expect(capturedSignal?.aborted).toBe(true);
    await waitFor(() => expect(view.container.querySelector('img')).toBeNull());
    expect(screen.queryByText(/Failed|HTTP|aborted/i)).not.toBeInTheDocument();
  });

  it('aborts any still-uploading attachment on unmount (B-172)', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockUploadMedia.mockImplementation(
      (_file, _onProgress, options) =>
        new Promise(() => {
          capturedSignal = options?.signal;
        }),
    );
    const view = renderCompose();

    const input = view.container.querySelector('input[type="file"]');
    fireEvent.change(input as Element, {
      target: { files: [new File(['bytes'], 'shot.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(capturedSignal).toBeDefined());

    view.unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
