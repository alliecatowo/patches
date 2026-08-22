import type { Actor } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from './ToastProvider.js';
import { ActorList } from './ActorList.js';

function renderList(props: Parameters<typeof ActorList>[0]): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <ActorList {...props} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  return render(tree);
}

describe('ActorList', () => {
  it('renders empty message when no actors', () => {
    renderList({ actors: [], emptyMessage: 'No followers yet.' });
    expect(screen.getByText('No followers yet.')).toBeInTheDocument();
  });

  it('renders actor list with nameplates and handles', () => {
    const actors = [
      {
        id: 'actor-violet',
        handle: 'violet',
        displayName: 'Violet',
        bio: 'Hello world',
      } as unknown as Actor,
    ];
    renderList({ actors, emptyMessage: 'No followers yet.' });
    expect(screen.getByText('Violet')).toBeInTheDocument();
    expect(screen.getByText('@violet')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });
});
