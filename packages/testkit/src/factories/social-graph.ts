import { Block, Follow, Mute } from '@patches/database';
import type { EntityManager } from 'typeorm';

/**
 * Phase 3 social-graph fixtures (`INITIAL_VISION.md` §50, §61) — same shape as
 * `identity.ts`/`content.ts`'s factories: caller-supplied `EntityManager`, so fixtures roll
 * back with `withTransactionRollback`.
 */

export interface CreateTestFollowOptions {
  followerActorId: string;
  followeeActorId: string;
  createdAt?: Date;
}

/** A `FOLLOWING` edge — v0 never produces `PENDING` (spec §50), so there is no option for it. */
export async function createTestFollow(
  manager: EntityManager,
  options: CreateTestFollowOptions,
): Promise<Follow> {
  const follows = manager.getRepository(Follow);
  return follows.save(
    follows.create({
      followerActorId: options.followerActorId,
      followeeActorId: options.followeeActorId,
      status: 'FOLLOWING',
      acceptedAt: options.createdAt ?? new Date(),
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestBlockOptions {
  blockerActorId: string;
  blockedActorId: string;
}

export async function createTestBlock(
  manager: EntityManager,
  options: CreateTestBlockOptions,
): Promise<Block> {
  const blocks = manager.getRepository(Block);
  return blocks.save(
    blocks.create({
      blockerActorId: options.blockerActorId,
      blockedActorId: options.blockedActorId,
    }),
  );
}

export interface CreateTestMuteOptions {
  muterActorId: string;
  mutedActorId: string;
}

export async function createTestMute(
  manager: EntityManager,
  options: CreateTestMuteOptions,
): Promise<Mute> {
  const mutes = manager.getRepository(Mute);
  return mutes.save(
    mutes.create({
      muterActorId: options.muterActorId,
      mutedActorId: options.mutedActorId,
    }),
  );
}
