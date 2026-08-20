import { randomBytes } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { E2eeNodeFrankingKey } from '../entities/e2ee-node-franking-key.entity.js';

/**
 * Persisted node franking-key custody (ADR 0020 §9, §12.7, P13-015). Pure functions over an
 * `EntityManager`, same reasoning as `src/repositories/outbox.ts`: `apps/server`'s key-ring
 * provider and `apps/worker`'s rotation handler both need exactly this logic, and
 * `packages/database` must not import NestJS (spec §128-129).
 */

export interface NodeFrankingKeySnapshot {
  readonly era: number;
  readonly keyMaterial: Buffer;
  readonly createdAt: Date;
}

/** Every known key era, oldest first. Never filtered to "current only" — ADR 0020 §12.7 requires
 * that verifying an old tag still resolve the era it was signed under, so every reader that needs
 * to verify (as opposed to sign new tags) must see the whole history, not just the newest row. */
export async function loadNodeFrankingKeys(
  manager: EntityManager,
): Promise<NodeFrankingKeySnapshot[]> {
  const rows = await manager.getRepository(E2eeNodeFrankingKey).find({ order: { era: 'ASC' } });
  return rows.map((row) => ({
    era: row.era,
    keyMaterial: row.keyMaterial,
    createdAt: row.createdAt,
  }));
}

/**
 * Mints the next era's key inside the caller's transaction. Locks the current-highest row
 * `FOR UPDATE` first (a no-op lock when the table is empty) so two concurrent rotations started
 * at once compute different `era` values rather than both racing for the same one; the unique
 * index on `era` is the actual correctness backstop if a lock is ever bypassed (e.g. a bug),
 * matching `claimOutboxJobs`' "lock avoids a wasted round trip, the constraint is what's actually
 * safe" reasoning.
 *
 * `keyMaterial`/`now` are only ever overridden by tests — production callers always take the
 * random 32-byte default and the wall clock.
 */
export async function rotateNodeFrankingKey(
  manager: EntityManager,
  options: { now?: Date; keyMaterial?: Buffer } = {},
): Promise<NodeFrankingKeySnapshot> {
  const repository = manager.getRepository(E2eeNodeFrankingKey);
  const current = await manager
    .createQueryBuilder(E2eeNodeFrankingKey, 'key')
    .orderBy('key.era', 'DESC')
    .limit(1)
    .setLock('pessimistic_write')
    .getOne();

  const era = (current?.era ?? 0) + 1;
  const keyMaterial = options.keyMaterial ?? randomBytes(32);
  const createdAt = options.now ?? new Date();
  await repository.insert({ era, keyMaterial, createdAt });
  return { era, keyMaterial, createdAt };
}

/** The most recently minted era, or `undefined` if this node has never rotated a key. */
export async function latestNodeFrankingKey(
  manager: EntityManager,
): Promise<NodeFrankingKeySnapshot | undefined> {
  const row = await manager
    .getRepository(E2eeNodeFrankingKey)
    .findOne({ where: {}, order: { era: 'DESC' } });
  return row === null
    ? undefined
    : { era: row.era, keyMaterial: row.keyMaterial, createdAt: row.createdAt };
}
