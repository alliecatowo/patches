import { Actor, User } from '@patches/database';
import type { DataSource, EntityManager } from 'typeorm';

/** Anything with a TypeORM `.getRepository()` — a plain `DataSource` for read-only lookups,
 * or a transactional `EntityManager` inside a mutating command's transaction. */
type Runner = DataSource | EntityManager;

/**
 * Resolves a handle to its `User`/`Actor` pair — every `user`/`report`/`invite` command that
 * takes a `<handle>` argument goes through this, so "no such account" is reported
 * identically everywhere rather than each command inventing its own not-found message.
 */
export async function findUserByHandle(
  runner: Runner,
  handle: string,
): Promise<{ user: User; actor: Actor }> {
  const actor = await runner
    .getRepository(Actor)
    .findOne({ where: { handleNormalized: handle.trim().toLowerCase() } });
  if (actor === null || actor.userId === null) {
    throw new Error(`No account found for handle "${handle}".`);
  }

  const user = await runner.getRepository(User).findOne({ where: { id: actor.userId } });
  if (user === null) {
    throw new Error(`No account found for handle "${handle}".`);
  }

  return { user, actor };
}
