import { FILTER_ACTION, FILTER_TERM_KIND } from '../api/wire/enums.js';
import type { FilterList, FilterListSubscription } from '../api/wire/types.js';
import { describe, expect, it, vi } from 'vitest';

import type { CliIo } from './io.js';
import { runLists, type FilterListCommandApi } from './lists.js';

function makeIo(): CliIo & { out: string[]; err: string[] } {
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
    readStdin: () => Promise.reject(new Error('not used')),
  };
}

function list(): FilterList {
  return {
    id: 'list-1',
    ownerActor: { id: 'a1', handle: 'alice' } as FilterList['ownerActor'],
    ownerCommunity: undefined,
    name: 'curated',
    displayName: 'Curated blocklist',
    description: '',
    createdAt: undefined,
    updatedAt: undefined,
  };
}

function subscription(): FilterListSubscription {
  return { filterList: list(), action: FILTER_ACTION.COLLAPSE, scopes: [], createdAt: undefined };
}

function fakeApi(): FilterListCommandApi {
  return {
    listFilterLists: vi.fn().mockResolvedValue({ filterLists: [list()], page: undefined }),
    listFilterListSubscriptions: vi
      .fn()
      .mockResolvedValue({ subscriptions: [subscription()], page: undefined }),
    listFilterListEntries: vi.fn().mockResolvedValue({
      entries: [
        { id: 'e1', kind: FILTER_TERM_KIND.DOMAIN, value: 'spam.example', createdAt: undefined },
      ],
      page: undefined,
    }),
    publishFilterList: vi.fn().mockResolvedValue({ filterList: list() }),
    subscribeFilterList: vi.fn().mockResolvedValue({ subscription: subscription() }),
    unsubscribeFilterList: vi.fn().mockResolvedValue({}),
    setFilterListEntryException: vi.fn().mockResolvedValue({}),
  };
}

const BASE = { env: {}, target: 'node.test:443', insecure: false } as const;

describe('runLists', () => {
  it('browses publicly published lists', async () => {
    const io = makeIo();
    const api = fakeApi();
    const code = await runLists(['browse'], { io, api, ...BASE });
    expect(code).toBe(0);
    expect(io.out.join('')).toContain('Curated blocklist\t@alice');
  });

  it('shows the caller’s own subscriptions', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');
    const code = await runLists(['mine'], { io, api, ensureAccessToken, ...BASE });
    expect(code).toBe(0);
    expect(api.listFilterListSubscriptions).toHaveBeenCalledWith('', 20, 'token');
    expect(io.out.join('')).toContain('FILTER_ACTION_COLLAPSE');
  });

  it('publishes a list from --term flags', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');
    const code = await runLists(
      [
        'publish',
        '--name',
        'curated',
        '--display-name',
        'Curated blocklist',
        '--term',
        'domain:spam.example',
      ],
      { io, api, ensureAccessToken, ...BASE },
    );
    expect(code).toBe(0);
    expect(api.publishFilterList).toHaveBeenCalledWith(
      {
        name: 'curated',
        displayName: 'Curated blocklist',
        description: '',
        ownerCommunityId: '',
        entries: [{ kind: FILTER_TERM_KIND.DOMAIN, value: 'spam.example' }],
      },
      'token',
    );
  });

  it('subscribes with the default collapse action', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');
    const code = await runLists(['subscribe', 'list-1'], { io, api, ensureAccessToken, ...BASE });
    expect(code).toBe(0);
    expect(api.subscribeFilterList).toHaveBeenCalledWith('list-1', FILTER_ACTION.COLLAPSE, 'token');
  });

  it('sets an exception for a specific entry without unsubscribing', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');
    const code = await runLists(['exception', 'list-1', 'e1', 'on'], {
      io,
      api,
      ensureAccessToken,
      ...BASE,
    });
    expect(code).toBe(0);
    expect(api.setFilterListEntryException).toHaveBeenCalledWith('list-1', 'e1', true, 'token');
    expect(api.unsubscribeFilterList).not.toHaveBeenCalled();
  });
});
