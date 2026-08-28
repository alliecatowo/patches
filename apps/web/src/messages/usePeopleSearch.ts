import type { Actor } from '@patches/proto/es';
import { useQuery } from '@tanstack/react-query';

import { api } from '../api/client.js';

const BOOST_SCAN_LIMIT = 50;
const SEARCH_LIMIT = 20;
const DEBOUNCE_MS = 200;

function matchesQuery(actor: Actor, needle: string): boolean {
  const lower = needle.toLowerCase();
  return (
    actor.handle.toLowerCase().includes(lower) || actor.displayName.toLowerCase().includes(lower)
  );
}

function byHandleAlphabetical(a: Actor, b: Actor): number {
  return a.handle.localeCompare(b.handle);
}

/**
 * Rank hint for a result — never an engagement/relevance score (spec §194), just which of the
 * three groups it falls in so the UI can label/order them: exact handle match, then prefix
 * match, then everyone else, alphabetical within each group.
 */
function rank(actor: Actor, needle: string): number {
  const lower = needle.toLowerCase();
  if (actor.handle.toLowerCase() === lower) return 0;
  if (
    actor.handle.toLowerCase().startsWith(lower) ||
    actor.displayName.toLowerCase().startsWith(lower)
  ) {
    return 1;
  }
  return 2;
}

export interface PeopleSearchResult {
  readonly candidates: readonly Actor[];
  /** ids present in `candidates` that the viewer follows or is followed by — the picker uses
   * this to label/boost rows without a second engagement ranking axis. */
  readonly boostedIds: ReadonlySet<string>;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

/**
 * Shared people-search for both the DM picker (#322) and `@`-mention autocomplete (#318):
 * `SearchActors` fuzzy-matched over handle + display name, merged client-side with the
 * viewer's follows/followers so those surface first. Ordering is exact match, then prefix
 * match, then alphabetical — never engagement-derived (spec §194).
 */
export function usePeopleSearch(
  query: string,
  viewerActorId: string | undefined,
  excludeActorIds: readonly string[] = [],
): PeopleSearchResult {
  const trimmed = query.trim();
  const enabled = viewerActorId !== undefined;
  const excluded = new Set(excludeActorIds);

  const followingQuery = useQuery({
    queryKey: ['people-search', 'following', viewerActorId],
    queryFn: () =>
      api.actors.listFollowing({
        actorId: viewerActorId ?? '',
        cursor: '',
        limit: BOOST_SCAN_LIMIT,
      }),
    enabled,
    staleTime: 60_000,
  });
  const followersQuery = useQuery({
    queryKey: ['people-search', 'followers', viewerActorId],
    queryFn: () =>
      api.actors.listFollowers({
        actorId: viewerActorId ?? '',
        cursor: '',
        limit: BOOST_SCAN_LIMIT,
      }),
    enabled,
    staleTime: 60_000,
  });
  const searchQuery = useQuery({
    queryKey: ['people-search', 'search', trimmed],
    queryFn: () => api.actors.searchActors({ query: trimmed, cursor: '', limit: SEARCH_LIMIT }),
    enabled: enabled && trimmed !== '',
    // Debounced via a stable staleTime rather than a timer here — callers that want the
    // classic "wait while typing" feel own their own input-level debounce (see PeoplePicker).
    staleTime: DEBOUNCE_MS,
  });

  const boosted = [...(followingQuery.data?.actors ?? []), ...(followersQuery.data?.actors ?? [])];
  const boostedIds = new Set(boosted.map((actor) => actor.id));

  let pool: Actor[];
  if (trimmed === '') {
    const seen = new Set<string>();
    pool = boosted.filter((actor) => {
      if (seen.has(actor.id)) return false;
      seen.add(actor.id);
      return true;
    });
    pool.sort(byHandleAlphabetical);
  } else {
    const searched = searchQuery.data?.actors ?? [];
    const matchedBoosted = boosted.filter((actor) => matchesQuery(actor, trimmed));
    const seen = new Set<string>();
    pool = [...matchedBoosted, ...searched].filter((actor) => {
      if (seen.has(actor.id)) return false;
      seen.add(actor.id);
      return true;
    });
    pool.sort((a, b) => rank(a, trimmed) - rank(b, trimmed) || byHandleAlphabetical(a, b));
  }

  const candidates = pool.filter((actor) => !excluded.has(actor.id));

  return {
    candidates,
    boostedIds,
    isLoading:
      followingQuery.isPending ||
      followersQuery.isPending ||
      (trimmed !== '' && searchQuery.isPending),
    isError: followingQuery.isError || followersQuery.isError || searchQuery.isError,
  };
}
