import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import type { Actor } from '../api/wire/types.js';
import { mentionCandidates } from './mention-candidates.js';

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 'a1',
    handle: 'alice',
    displayName: 'Alice',
    bio: '',
    locationText: '',
    websiteUrl: '',
    avatar: undefined,
    isLocal: true,
    joinedAt: undefined,
    counts: undefined,
    nameplate: undefined,
    flair: undefined,
    pinnedPostIds: [],
    homeServer: '',
    profileFrame: 0,
    nameTagStyle: 0,
    accentColor: '',
    ...overrides,
  } as Actor;
}

function fakeApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    listFollowing: vi
      .fn()
      .mockResolvedValue({ actors: [], page: { nextCursor: '', hasMore: false } }),
    searchActors: vi
      .fn()
      .mockResolvedValue({ actors: [], page: { nextCursor: '', hasMore: false } }),
    getRelationship: vi.fn().mockResolvedValue({ relationship: undefined }),
    ...overrides,
  } as unknown as PatchesApi;
}

const ensureAccessToken = (): Promise<string> => Promise.resolve('token');

describe('mentionCandidates', () => {
  it('returns nothing for an empty query without calling the network', async () => {
    const api = fakeApi();
    const result = await mentionCandidates(
      api,
      ensureAccessToken,
      'viewer-1',
      '',
      new AbortController().signal,
    );
    expect(result).toEqual([]);
    expect(api.listFollowing).not.toHaveBeenCalled();
  });

  it('lists prefix-matching follows before search results, deduplicated, ranked deterministically with reason provenance', async () => {
    const api = fakeApi({
      listFollowing: vi.fn().mockResolvedValue({
        actors: [
          actor({ id: 'f2', handle: 'bob', displayName: 'Bob' }),
          actor({ id: 'f1', handle: 'alice' }),
          actor({ id: 'f3', handle: 'al', displayName: 'Al' }),
        ],
        page: { nextCursor: '', hasMore: false },
      }),
      searchActors: vi.fn().mockResolvedValue({
        actors: [
          actor({ id: 'f1', handle: 'alice' }),
          actor({ id: 's1', handle: 'alex', displayName: 'Alex' }),
          actor({ id: 'f3', handle: 'al', displayName: 'Al' }),
        ],
        page: { nextCursor: '', hasMore: false },
      }),
    });

    const result = await mentionCandidates(
      api,
      ensureAccessToken,
      'viewer-1',
      'al',
      new AbortController().signal,
    );

    expect(result.map((a) => ({ handle: a.handle, reason: a.reason }))).toEqual([
      { handle: 'al', reason: 'following' },
      { handle: 'alice', reason: 'following' },
      { handle: 'alex', reason: 'search' },
    ]);
  });

  it('drops a blocked or muted actor from the merged candidate list', async () => {
    const blocked = actor({ id: 'b1', handle: 'annoying' });
    const muted = actor({ id: 'm1', handle: 'anon' });
    const clean = actor({ id: 'c1', handle: 'ana' });
    const api = fakeApi({
      searchActors: vi.fn().mockResolvedValue({
        actors: [blocked, muted, clean],
        page: { nextCursor: '', hasMore: false },
      }),
      getRelationship: vi.fn((request: { actorId?: string }) => {
        const actorId = request.actorId;
        if (actorId === 'b1') {
          return Promise.resolve({
            relationship: {
              state: 0,
              followedBy: false,
              blocking: true,
              muting: false,
              requested: false,
              requestedBy: false,
            },
          });
        }
        if (actorId === 'm1') {
          return Promise.resolve({
            relationship: {
              state: 0,
              followedBy: false,
              blocking: false,
              muting: true,
              requested: false,
              requestedBy: false,
            },
          });
        }
        return Promise.resolve({ relationship: undefined });
      }) as unknown as PatchesApi['getRelationship'],
    });

    const result = await mentionCandidates(
      api,
      ensureAccessToken,
      'viewer-1',
      'an',
      new AbortController().signal,
    );

    expect(result.map((a) => a.handle)).toEqual(['ana']);
  });
});
