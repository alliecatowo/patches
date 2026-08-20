import { FILTER_ACTION, FILTER_TERM_KIND } from '@patches/proto';
import type { Filter } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { FiltersScreen } from './FiltersScreen.js';

function filter(overrides: Partial<Filter> = {}): Filter {
  return {
    id: 'filter-1',
    name: 'Spoilers',
    terms: [{ id: 't1', kind: FILTER_TERM_KIND.WORD, value: 'spoiler' }],
    scopes: [],
    action: FILTER_ACTION.COLLAPSE,
    expiresAt: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    ...overrides,
  };
}

function buildApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    target: 'patches.test:50051',
    listFilters: vi.fn().mockResolvedValue({ filters: [filter()], page: undefined }),
    createFilter: vi
      .fn()
      .mockResolvedValue({ filter: filter({ id: 'filter-2', name: 'New one' }) }),
    deleteFilter: vi.fn().mockResolvedValue({}),
    exportFilters: vi.fn().mockResolvedValue({ json: '{"filters":[]}' }),
    ...overrides,
  } as unknown as PatchesApi;
}

describe('FiltersScreen', () => {
  it('lists the caller’s own filters', async () => {
    const api = buildApi();
    const { lastFrame } = render(
      <FiltersScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onConfirm={() => undefined}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('Spoilers'));
    expect(lastFrame()).toContain('collapse');
    expect(lastFrame()).toContain('word:spoiler');
  });

  it('creates a filter through the inline form', async () => {
    const createFilter = vi
      .fn()
      .mockResolvedValue({ filter: filter({ id: 'filter-2', name: 'Politics' }) });
    const api = buildApi({ createFilter });
    const { lastFrame, stdin } = render(
      <FiltersScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onConfirm={() => undefined}
        onBack={() => undefined}
      />,
    );

    const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

    await vi.waitFor(() => expect(lastFrame()).toContain('Spoilers'));
    stdin.write('n');
    await vi.waitFor(() => expect(lastFrame()).toContain('New filter'));
    stdin.write('Politics');
    await flush();
    stdin.write('\t'); // name -> kind
    await flush();
    stdin.write('\t'); // kind -> value
    await flush();
    stdin.write('election');
    await flush();
    stdin.write('\t'); // value -> action
    await flush();
    stdin.write('\r'); // submit

    await vi.waitFor(() =>
      expect(createFilter).toHaveBeenCalledWith(
        {
          name: 'Politics',
          terms: [{ kind: FILTER_TERM_KIND.SUBSTRING, value: 'election' }],
          scopes: [],
          action: FILTER_ACTION.COLLAPSE,
          expiresAt: undefined,
        },
        'token',
      ),
    );
  });

  it('asks for confirmation before deleting the selected filter', async () => {
    const onConfirm = vi.fn();
    const api = buildApi();
    const { lastFrame, stdin } = render(
      <FiltersScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onConfirm={onConfirm}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('Spoilers'));
    stdin.write('X');
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalled());
  });
});
