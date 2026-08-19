import { Community } from '@patches/database';
import { In, type EntityManager } from 'typeorm';

import type { CommunitySummaryView } from './post.dto.js';

/**
 * Shared `Community` row → `CommunitySummaryView` lookups for `Post.community` (spec §189,
 * §190), used by `PostService` (single post) and `feeds/post-batch.ts` (a page of posts) —
 * kept out of both so neither owns a second copy of the same query shape.
 */

function toCommunitySummaryView(row: Community): CommunitySummaryView {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    rules: row.rules,
    isPublic: row.isPublic,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function communitySummaryOf(
  manager: EntityManager,
  communityId: string,
): Promise<CommunitySummaryView | null> {
  const row = await manager.getRepository(Community).findOne({ where: { id: communityId } });
  return row === null ? null : toCommunitySummaryView(row);
}

/** Batched lookup for a page of posts — one query regardless of how many distinct
 * `communityId`s appear on the page. */
export async function communitySummariesFor(
  manager: EntityManager,
  communityIds: readonly string[],
): Promise<Map<string, CommunitySummaryView>> {
  const map = new Map<string, CommunitySummaryView>();
  const distinctIds = [...new Set(communityIds)];
  if (distinctIds.length === 0) return map;

  const rows = await manager.getRepository(Community).find({ where: { id: In(distinctIds) } });
  for (const row of rows) map.set(row.id, toCommunitySummaryView(row));
  return map;
}
