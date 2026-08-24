import { Block, Follow, MessageRequest } from '@patches/database';
import type { EntityManager } from 'typeorm';

/**
 * The one definition of "may this caller contact this target directly" (spec §183.2): mutual
 * follow, or the target accepted a message request previously sent by the caller.
 *
 * Extracted from `MessagesService` so the E2EE module's first-contact surfaces
 * (`CreateE2eeConversation`, `AddE2eeMember`) enforce exactly the same eligibility rule as the
 * legacy DM paths instead of a second, drifting copy — the audit found `AddE2eeMember`'s
 * block-only check let a stranger who was never eligible for legacy DM demand first contact
 * through the E2EE path. Callers own their own uniform, no-oracle error mapping (spec §62).
 */
export async function mayMessageDirectly(
  manager: EntityManager,
  callerId: string,
  targetId: string,
): Promise<boolean> {
  if (await isMutualFollow(manager, callerId, targetId)) return true;
  const acceptedByTarget = await manager.getRepository(MessageRequest).findOne({
    where: { senderActorId: callerId, recipientActorId: targetId, status: 'ACCEPTED' },
  });
  return acceptedByTarget !== null;
}

async function isMutualFollow(
  manager: EntityManager,
  actorAId: string,
  actorBId: string,
): Promise<boolean> {
  const follows = manager.getRepository(Follow);
  const [aFollowsB, bFollowsA] = await Promise.all([
    follows.findOne({
      where: { followerActorId: actorAId, followeeActorId: actorBId, status: 'FOLLOWING' },
    }),
    follows.findOne({
      where: { followerActorId: actorBId, followeeActorId: actorAId, status: 'FOLLOWING' },
    }),
  ]);
  return aFollowsB !== null && bFollowsA !== null;
}

/** Both directions of the block graph in one round-trip pair — kept beside
 * `mayMessageDirectly` because every eligibility consumer checks blocks too. */
export async function blockedEitherDirection(
  manager: EntityManager,
  actorAId: string,
  actorBId: string,
): Promise<boolean> {
  const blocks = manager.getRepository(Block);
  const [aBlocksB, bBlocksA] = await Promise.all([
    blocks.findOne({ where: { blockerActorId: actorAId, blockedActorId: actorBId } }),
    blocks.findOne({ where: { blockerActorId: actorBId, blockedActorId: actorAId } }),
  ]);
  return aBlocksB !== null || bBlocksA !== null;
}
