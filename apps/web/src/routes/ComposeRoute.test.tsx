import type { PatchesApi } from '@patches/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreatePost = vi.fn();
const mockGetNodeInfo = vi.fn().mockResolvedValue({
  socialCapabilities: { maxPostChars: 500 },
});

vi.mock('../api/client.js', () => ({
  api: {
    posts: { createPost: mockCreatePost },
    node: { getNodeInfo: mockGetNodeInfo },
  } as unknown as PatchesApi,
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
  beforeEach(() => {
    window.localStorage.clear();
    mockCreatePost.mockReset();
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
});
