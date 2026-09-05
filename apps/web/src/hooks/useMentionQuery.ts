import type { Actor } from '@patches/proto/es';
import { useQuery } from '@tanstack/react-query';

import { api } from '../api/client.js';

const MAX_CANDIDATES = 8;
/** Bound on how many of the viewer's follows are scanned for a prefix match — v0 has no
 * "search my follows" RPC, so this fetches one page of `ListFollowing` and filters client-side
 * (§219). Large-follow-count accounts fall back to `SearchActors`-only ranking beyond this. */
const FOLLOWING_SCAN_LIMIT = 100;

function matchesPrefix(actor: Actor, query: string): boolean {
  const needle = query.toLowerCase();
  return (
    actor.handle.toLowerCase().startsWith(needle) ||
    actor.displayName.toLowerCase().startsWith(needle)
  );
}

function byHandleAlphabetical(a: Actor, b: Actor): number {
  return a.handle.localeCompare(b.handle);
}

/**
 * Candidate actors for `@`-mention autocomplete (§219): follows whose handle/display name
 * prefix-matches `query` first, then `ActorService.SearchActors` results for the same query,
 * de-duplicated, alphabetical within each group — never engagement/relevance-ranked (spec
 * §194). Actors the viewer blocks or mutes are dropped via `SocialGraphService.GetRelationship`
 * on the bounded candidate list (never over the whole follow/search result set).
 */
export interface MentionCandidate extends Actor {
  reason: 'following' | 'search';
}

function getMatchPriority(actor: Actor, query: string): number {
  const needle = query.toLowerCase();
  const handle = actor.handle.toLowerCase();
  const displayName = actor.displayName.toLowerCase();

  if (handle === needle) return 0;
  if (handle.startsWith(needle)) return 1;
  if (displayName.startsWith(needle)) return 2;
  return 3;
}

function compareCandidates(a: Actor, b: Actor, query: string): number {
  const pA = getMatchPriority(a, query);
  const pB = getMatchPriority(b, query);
  if (pA !== pB) return pA - pB;
  const handleCmp = a.handle.localeCompare(b.handle);
  if (handleCmp !== 0) return handleCmp;
  return a.id.localeCompare(b.id);
}

/**
 * Candidate actors for `@`-mention autocomplete (§219): follows whose handle/display name
 * prefix-matches `query` first, then `ActorService.SearchActors` results for the same query,
 * de-duplicated, ranked deterministically within each group (exact handle match -> handle prefix
 * -> displayName prefix -> alphabetical -> id) — never engagement/relevance-ranked (spec §194).
 * Each candidate carries its provenance (`reason: 'following' | 'search'`).
 * Actors the viewer blocks or mutes are dropped via `SocialGraphService.GetRelationship`
 * on the bounded candidate list (never over the whole follow/search result set).
 */
export function useMentionQuery(
  query: string,
  viewerActorId: string | undefined,
): { candidates: MentionCandidate[]; isLoading: boolean } {
  const trimmed = query.trim();
  const enabled = trimmed.length > 0 && viewerActorId !== undefined;

  const followingQuery = useQuery({
    queryKey: ['mention-autocomplete', 'following', viewerActorId],
    queryFn: () =>
      api.actors.listFollowing({
        actorId: viewerActorId ?? '',
        cursor: '',
        limit: FOLLOWING_SCAN_LIMIT,
      }),
    enabled,
    staleTime: 60_000,
  });

  const searchQuery = useQuery({
    queryKey: ['mention-autocomplete', 'search', trimmed],
    queryFn: () => api.actors.searchActors({ query: trimmed, cursor: '', limit: MAX_CANDIDATES }),
    enabled,
  });

  const following = followingQuery.data?.actors ?? [];
  const searched = searchQuery.data?.actors ?? [];

  const fromFollows: MentionCandidate[] = following
    .filter((actor) => getMatchPriority(actor, trimmed) < 3)
    .sort((a, b) => compareCandidates(a, b, trimmed))
    .map((actor) => ({ ...actor, reason: 'following' as const }));

  const seen = new Set(fromFollows.map((actor) => actor.id));

  const fromSearch: MentionCandidate[] = searched
    .filter((actor) => !seen.has(actor.id) && getMatchPriority(actor, trimmed) < 3)
    .sort((a, b) => compareCandidates(a, b, trimmed))
    .map((actor) => ({ ...actor, reason: 'search' as const }));

  const merged = [...fromFollows, ...fromSearch].slice(0, MAX_CANDIDATES);

  const relationshipsQuery = useQuery({
    queryKey: ['mention-autocomplete', 'relationships', merged.map((actor) => actor.id)],
    queryFn: async () => {
      const results = await Promise.all(
        merged.map((actor) => api.socialGraph.getRelationship({ actorId: actor.id })),
      );
      return new Set(
        merged
          .filter((_actor, index) => {
            const relationship = results[index]?.relationship;
            return relationship?.blocking === true || relationship?.muting === true;
          })
          .map((actor) => actor.id),
      );
    },
    enabled: enabled && merged.length > 0,
  });

  const excluded = relationshipsQuery.data ?? new Set<string>();
  const candidates = merged.filter((actor) => !excluded.has(actor.id));

  return {
    candidates,
    isLoading: followingQuery.isPending || searchQuery.isPending || relationshipsQuery.isPending,
  };
}
