import { FILTER_ACTION, FILTER_SCOPE, FILTER_TERM_KIND } from '../api/wire/enums.js';
import type { Filter } from '../api/wire/types.js';
import { describe, expect, it, vi } from 'vitest';

import type { CliIo } from './io.js';
import { runFilter, type FilterCommandApi } from './filter.js';
import { makeFilter } from '../test/wire-fixtures.js';

function makeIo(overrides: Partial<CliIo> = {}): CliIo & { out: string[]; err: string[] } {
  return {
    isTTY: false,
    out: [],
    err: [],
    stdout(text: string) {
      this.out.push(text);
    },
    stderr(text: string) {
      this.err.push(text);
    },
    prompt: () => Promise.reject(new Error('not used')),
    promptPassword: () => Promise.reject(new Error('not used')),
    readStdin: () => Promise.resolve(''),
    ...overrides,
  };
}

function filter(): Filter {
  return makeFilter({ scopes: [FILTER_SCOPE.HOME] });
}

function fakeApi(): FilterCommandApi {
  return {
    listFilters: vi.fn().mockResolvedValue({ filters: [filter()], page: undefined }),
    createFilter: vi.fn().mockResolvedValue({ filter: filter() }),
    deleteFilter: vi.fn().mockResolvedValue({}),
    exportFilters: vi.fn().mockResolvedValue({ json: '{"filters":[]}' }),
    importFilters: vi.fn().mockResolvedValue({ added: [filter()] }),
  };
}

const BASE = { env: {}, target: 'node.test:443', insecure: false } as const;

describe('runFilter', () => {
  it('lists the caller’s own filters', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    const code = await runFilter(['list'], { io, api, ensureAccessToken, ...BASE });

    expect(code).toBe(0);
    expect(api.listFilters).toHaveBeenCalledWith('', 20, 'token');
    expect(io.out.join('')).toContain('filter-1\tSpoilers');
  });

  it('creates a filter from --term/--scope/--action flags', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    const code = await runFilter(
      [
        'create',
        '--name',
        'Spoilers',
        '--action',
        'collapse',
        '--term',
        'word:spoiler',
        '--scope',
        'home',
      ],
      { io, api, ensureAccessToken, ...BASE },
    );

    expect(code).toBe(0);
    expect(api.createFilter).toHaveBeenCalledWith(
      {
        name: 'Spoilers',
        terms: [{ kind: FILTER_TERM_KIND.WORD, value: 'spoiler' }],
        scopes: [FILTER_SCOPE.HOME],
        action: FILTER_ACTION.COLLAPSE,
      },
      'token',
    );
  });

  it('create rejects a missing --term', async () => {
    const io = makeIo();
    const api = fakeApi();
    const code = await runFilter(['create', '--name', 'x', '--action', 'hide'], {
      io,
      api,
      ensureAccessToken: vi.fn().mockResolvedValue('token'),
      ...BASE,
    });
    expect(code).toBe(1);
    expect(api.createFilter).not.toHaveBeenCalled();
  });

  it('deletes a filter by id', async () => {
    const io = makeIo();
    const api = fakeApi();
    const code = await runFilter(['delete', 'filter-1'], {
      io,
      api,
      ensureAccessToken: vi.fn().mockResolvedValue('token'),
      ...BASE,
    });
    expect(code).toBe(0);
    expect(api.deleteFilter).toHaveBeenCalledWith('filter-1', 'token');
  });

  it('exports filters as plain JSON', async () => {
    const io = makeIo();
    const api = fakeApi();
    const code = await runFilter(['export'], {
      io,
      api,
      ensureAccessToken: vi.fn().mockResolvedValue('token'),
      ...BASE,
    });
    expect(code).toBe(0);
    expect(io.out.join('')).toContain('{"filters":[]}');
  });

  it('imports as a dry run by default, and applies with --apply', async () => {
    const io = makeIo({ readStdin: () => Promise.resolve('{"filters":[]}') });
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    const code = await runFilter(['import'], { io, api, ensureAccessToken, ...BASE });

    expect(code).toBe(0);
    expect(api.importFilters).toHaveBeenCalledWith('{"filters":[]}', false, 'token');
    expect(io.out.join('')).toContain('Would import 1 filter(s)');
  });
});
