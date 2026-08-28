import type { PatchesApi } from '@patches/client';
import type { Actor } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PeoplePicker } from './PeoplePicker.js';

const mockListFollowing = vi.fn<(...args: unknown[]) => Promise<{ actors: Actor[] }>>();
const mockListFollowers = vi.fn<(...args: unknown[]) => Promise<{ actors: Actor[] }>>();
const mockSearchActors = vi.fn<(...args: unknown[]) => Promise<{ actors: Actor[] }>>();

vi.mock('../api/client.js', () => ({
  api: {
    actors: {
      listFollowing: (...args: unknown[]): Promise<{ actors: Actor[] }> =>
        mockListFollowing(...args),
      listFollowers: (...args: unknown[]): Promise<{ actors: Actor[] }> =>
        mockListFollowers(...args),
      searchActors: (...args: unknown[]): Promise<{ actors: Actor[] }> => mockSearchActors(...args),
    },
  } as unknown as PatchesApi,
}));

function actor(id: string, handle: string, displayName = handle): Actor {
  return { id, handle, displayName } as unknown as Actor;
}

function renderPicker(onSelect = vi.fn()): { onSelect: typeof onSelect } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <PeoplePicker viewerActorId="actor-me" onSelect={onSelect} />
    </QueryClientProvider>
  );
  render(tree);
  return { onSelect };
}

describe('PeoplePicker', () => {
  beforeEach(() => {
    mockListFollowing.mockReset();
    mockListFollowing.mockResolvedValue({ actors: [] });
    mockListFollowers.mockReset();
    mockListFollowers.mockResolvedValue({ actors: [] });
    mockSearchActors.mockReset();
    mockSearchActors.mockResolvedValue({ actors: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows follows first with an empty query', async () => {
    mockListFollowing.mockResolvedValue({ actors: [actor('actor-violet', 'violet')] });
    renderPicker();

    await vi.waitFor(() =>
      expect(screen.getByRole('option', { name: /@violet/ })).toBeInTheDocument(),
    );
    expect(screen.getByText('Follows')).toBeInTheDocument();
  });

  it('debounces and fuzzy-matches by handle/display name', async () => {
    mockSearchActors.mockResolvedValue({ actors: [actor('actor-rose', 'rosebud', 'Rose')] });
    renderPicker();

    fireEvent.change(screen.getByLabelText('Search by handle or name'), {
      target: { value: 'rose' },
    });
    expect(mockSearchActors).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() =>
      expect(mockSearchActors).toHaveBeenCalledWith(expect.objectContaining({ query: 'rose' })),
    );
  });

  it('is keyboard navigable: Down moves selection, Enter picks it', async () => {
    mockListFollowing.mockResolvedValue({
      actors: [actor('actor-violet', 'violet'), actor('actor-rose', 'rose')],
    });
    const { onSelect } = renderPicker();

    const input = screen.getByLabelText('Search by handle or name');
    await vi.waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

    // Candidates are alphabetical by handle ('rose' then 'violet'), so ArrowDown from the
    // first row lands on 'violet'.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'actor-violet' }));
  });
});
