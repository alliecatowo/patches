import { Block, Follow } from '@patches/database';
import type { EntityManager } from 'typeorm';

/**
 * The one definition of "may this caller contact this target directly" (spec §183.2).
 *
 * Shared by the E2EE module's first-contact surfaces (`CreateE2eeConversation`,
 * `AddE2eeMember`) so they enforce one rule rather than two drifting copies — the audit found
 * `AddE2eeMember`'s block-only check let a stranger demand first contact through the E2EE path.
 * Callers own their own uniform, no-oracle error mapping (spec §62).
 *
 * §183.2's second arm ("or the target accepted a message request you sent") no longer has a
 * backing store: ADR 0030 deleted the whole `message_requests` flow with the plaintext DM
 * machinery, so mutual follow is the only path to first contact until an E2EE-native request
 * flow is designed. This is deliberately the *narrower* of the two possible readings — nobody
 * gains reach they did not already have.
 */
export async function mayMessageDirectly(
  manager: EntityManager,
  callerId: string,
  targetId: string,
): Promise<boolean> {
  return isMutualFollow(manager, callerId, targetId);
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
