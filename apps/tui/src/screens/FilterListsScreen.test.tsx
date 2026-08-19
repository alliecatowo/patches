import { FILTER_ACTION, type Actor, type FilterList } from '@patches/proto';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { FilterListsScreen } from './FilterListsScreen.js';

function actor(handle: string): Actor {
  return { id: 'a1', handle } as Actor;
}

function list(): FilterList {
  return {
    id: 'list-1',
    ownerActor: actor('alice'),
    ownerCommunity: undefined,
    name: 'curated',
    displayName: 'Curated blocklist',
    description: '',
    createdAt: undefined,
    updatedAt: undefined,
  };
}

function buildApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    target: 'patches.test:50051',
    listFilterLists: vi.fn().mockResolvedValue({ filterLists: [list()], page: undefined }),
    listFilterListSubscriptions: vi.fn().mockResolvedValue({ subscriptions: [], page: undefined }),
    subscribeFilterList: vi.fn().mockResolvedValue({ subscription: undefined }),
    unsubscribeFilterList: vi.fn().mockResolvedValue({}),
    publishFilterList: vi.fn().mockResolvedValue({ filterList: list() }),
    ...overrides,
  } as unknown as PatchesApi;
}

describe('FilterListsScreen', () => {
  it('browses publicly published lists', async () => {
    const api = buildApi();
    const { lastFrame } = render(
      <FilterListsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('Curated blocklist'));
    expect(lastFrame()).toContain('@alice');
  });

  it('subscribes to the selected list with the default collapse action', async () => {
    const subscribeFilterList = vi.fn().mockResolvedValue({});
    const api = buildApi({ subscribeFilterList });
    const { lastFrame, stdin } = render(
      <FilterListsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('Curated blocklist'));
    stdin.write('S');
    await vi.waitFor(() =>
      expect(subscribeFilterList).toHaveBeenCalledWith(
        { filterListId: 'list-1', action: FILTER_ACTION.COLLAPSE },
        'token',
      ),
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('Subscribed to Curated blocklist.'));
  });

  it('Tab switches to the "mine" subscriptions view', async () => {
    const api = buildApi();
    const { lastFrame, stdin } = render(
      <FilterListsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('Curated blocklist'));
    stdin.write('\t');
    await vi.waitFor(() => expect(lastFrame()).toContain('Filter lists — mine'));
    expect(lastFrame()).toContain('No subscriptions yet.');
  });
});
