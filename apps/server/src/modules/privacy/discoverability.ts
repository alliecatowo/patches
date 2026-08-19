import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * SQL pushdown for the discoverability prefs (`INITIAL_VISION.md` §197.5): `discoverable`,
 * `indexable`, and `show_in_local_feed` all default `true` ("no behaviour change for an actor
 * who ignores them"), so absence of an `actor_privacy_prefs` row — an actor who predates the
 * table — must read as `true`, not `false`. `NOT EXISTS (... AND column = false)` gets that for
 * free; `EXISTS (... AND column = true)` would wrongly exclude rowless actors.
 *
 * `actorColumnRef` must be a fully-qualified, quoted column reference (e.g.
 * `"actor"."id"`, `"post"."author_actor_id"`) — the same convention
 * `feed.service.ts#applyVisibilityFilter` uses (LEARNINGS: typeorm-querybuilder-alias-
 * substitution). `subqueryAlias` must be unique within a single query builder if any of these
 * are called more than once on the same `qb`.
 */
function applyDiscoverabilityColumnFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  actorColumnRef: string,
  column: 'discoverable' | 'indexable' | 'show_in_local_feed',
  subqueryAlias: string,
): void {
  qb.andWhere(
    `NOT EXISTS (
      SELECT 1 FROM actor_privacy_prefs ${subqueryAlias}
      WHERE ${subqueryAlias}.actor_id = ${actorColumnRef}
        AND ${subqueryAlias}.${column} = false
    )`,
  );
}

/** Excludes actors with `discoverable = false` from `ActorService.SearchActors` and any
 * directory/suggestion listing. Exact-handle resolution (`GetActorByHandle`, `ResolveActor`)
 * MUST NOT call this — §197.5 requires it to keep working regardless of this setting. */
export function applyDiscoverableFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  actorColumnRef: string,
): void {
  applyDiscoverabilityColumnFilter(qb, actorColumnRef, 'discoverable', 'discoverable_prefs');
}

/** Excludes posts authored by an actor with `indexable = false` from `PostService.SearchPosts`. */
export function applyIndexableFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  authorColumnRef: string,
): void {
  applyDiscoverabilityColumnFilter(qb, authorColumnRef, 'indexable', 'indexable_prefs');
}

/** Excludes posts authored by an actor with `show_in_local_feed = false` from
 * `FeedService.listLocalFeed`. Local-only; the posts remain public elsewhere. */
export function applyShowInLocalFeedFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  authorColumnRef: string,
): void {
  applyDiscoverabilityColumnFilter(qb, authorColumnRef, 'show_in_local_feed', 'local_feed_prefs');
}
