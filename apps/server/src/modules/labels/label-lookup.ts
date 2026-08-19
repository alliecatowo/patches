import { Label, Labeler, LabelerSubscription } from '@patches/database';
import type { EntityManager } from 'typeorm';

import type { LabelView } from './label.dto.js';

/**
 * Shared `Label` row → `LabelView` lookups for `Post.labels` (spec §200.3, §203), used by
 * `LabelService.labelsForPosts` (single-post/DI call sites) and `feeds/post-batch.ts` (a page
 * of posts, no DI) — kept out of both so neither owns a second copy of the same query shape,
 * the same split `posts/community-summary.ts` documents for `Post.community`.
 *
 * A label is visible here only to a viewer subscribed to its labeler, or every viewer at all
 * for the node's own labeler ("subscribed by default", spec §200.3) — this is the strict
 * feed-embedding rule from §203 ("populated only for labelers the viewer subscribes to"), with
 * **no** self-authorship exception. The self-inspection exception (§200.4 — an actor may see
 * labels from labelers they don't subscribe to, on their own posts/account) lives only in
 * `LabelService.listLabelsOnSubject`, which is a deliberate pull, not something that leaks into
 * an ordinary feed read.
 */

function toLabelView(row: Label): LabelView {
  return {
    id: row.id,
    labelerId: row.labelerId,
    subjectType: row.subjectType,
    subjectActorId: row.subjectActorId,
    subjectPostId: row.subjectPostId,
    value: row.value,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    retractedAt: row.retractedAt,
  };
}

/** Labeler ids visible to `viewerActorId`: their own subscriptions, plus every
 * `is_node_labeler` row (spec §200.3's "subscribed by default", enforced here rather than by
 * an actual `labeler_subscriptions` row per actor — see `labeler.entity.ts`'s doc). */
async function visibleLabelerIds(manager: EntityManager, viewerActorId: string): Promise<string[]> {
  const [subscriptions, nodeLabelers] = await Promise.all([
    manager.getRepository(LabelerSubscription).find({ where: { actorId: viewerActorId } }),
    manager.getRepository(Labeler).find({ where: { isNodeLabeler: true } }),
  ]);
  return [
    ...new Set([
      ...subscriptions.map((row) => row.labelerId),
      ...nodeLabelers.map((row) => row.id),
    ]),
  ];
}

/** Batched lookup for a page of posts — one query regardless of how many posts appear on the
 * page. Anonymous viewers (`viewerActorId === undefined`) never see labels: personalization
 * has no subject to scope to, the same convention `toPostView` already applies to
 * `viewerState` (spec §53). */
export async function labelsForPosts(
  manager: EntityManager,
  postIds: readonly string[],
  viewerActorId: string | undefined,
): Promise<Map<string, LabelView[]>> {
  const map = new Map<string, LabelView[]>();
  if (viewerActorId === undefined) return map;
  const distinctPostIds = [...new Set(postIds)];
  if (distinctPostIds.length === 0) return map;

  const labelerIds = await visibleLabelerIds(manager, viewerActorId);
  if (labelerIds.length === 0) return map;

  const now = new Date();
  const rows = await manager
    .getRepository(Label)
    .createQueryBuilder('label')
    .where('label.subjectPostId IN (:...postIds)', { postIds: distinctPostIds })
    .andWhere('label.labelerId IN (:...labelerIds)', { labelerIds })
    .andWhere('label.retractedAt IS NULL')
    .andWhere('(label.expiresAt IS NULL OR label.expiresAt > :now)', { now })
    .orderBy('label.createdAt', 'ASC')
    .getMany();

  for (const row of rows) {
    const postId = row.subjectPostId;
    if (postId === null) continue;
    const list = map.get(postId) ?? [];
    list.push(toLabelView(row));
    map.set(postId, list);
  }
  return map;
}

/** Same visibility rule as {@link labelsForPosts}, for a single subject already known to be a
 * post or an actor — used by `ListLabelsOnSubject` when the caller isn't the subject
 * (subscription-scoped, not self-inspection). */
export async function subscriberVisibleLabelerIds(
  manager: EntityManager,
  viewerActorId: string,
): Promise<string[]> {
  return visibleLabelerIds(manager, viewerActorId);
}

export { toLabelView };
