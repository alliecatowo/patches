import type { PatchesApi } from '../api/client.js';
import type { Actor } from '../api/wire/types.js';

const MAX_CANDIDATES = 8;
/** Bound on how many of the viewer's follows are scanned for a prefix match — v0 has no
 * "search my follows" RPC (same constraint as the web client's `useMentionQuery`, §219). */
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
 * Candidate actors for the `@`-mention popover (§219): follows whose handle/display name
 * prefix-matches `query` first, then `ActorService.SearchActors` results for the same query,
 * de-duplicated, alphabetical within each group — never engagement/relevance-ranked (spec
 * §194). Actors the viewer blocks or mutes are dropped via `SocialGraphService.GetRelationship`
 * on the bounded candidate list (never over the whole follow/search result set).
 */
export async function mentionCandidates(
  api: PatchesApi,
  ensureAccessToken: () => Promise<string>,
  viewerActorId: string,
  query: string,
  signal: AbortSignal,
): Promise<Actor[]> {
  if (query.trim() === '') return [];

  const [followingResponse, searchResponse] = await Promise.all([
    api
      .listFollowing({ actorId: viewerActorId, cursor: '', limit: FOLLOWING_SCAN_LIMIT })
      .catch(() => ({ actors: [] as Actor[] })),
    api.searchActors({ query, cursor: '', limit: MAX_CANDIDATES }),
  ]);
  if (signal.aborted) return [];

  const fromFollows = followingResponse.actors
    .filter((actor) => matchesPrefix(actor, query))
    .sort(byHandleAlphabetical);
  const seen = new Set(fromFollows.map((actor) => actor.id));
  const fromSearch = searchResponse.actors
    .filter((actor) => !seen.has(actor.id))
    .sort(byHandleAlphabetical);

  const merged = [...fromFollows, ...fromSearch].slice(0, MAX_CANDIDATES);
  if (merged.length === 0) return [];

  const accessToken = await ensureAccessToken();
  if (signal.aborted) return [];
  const relationships = await Promise.all(
    merged.map((actor) =>
      api
        .getRelationship({ actorId: actor.id }, accessToken)
        .then((response) => response.relationship)
        .catch(() => undefined),
    ),
  );
  if (signal.aborted) return [];

  return merged.filter((_actor, index) => {
    const relationship = relationships[index];
    return relationship?.blocking !== true && relationship?.muting !== true;
  });
}
