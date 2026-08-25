import { constants as fsConstants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import type { HarnessWorld } from './actions.js';

export interface WorldManifest {
  readonly version: 1;
  readonly digest: string;
  readonly keys: readonly string[];
  readonly completedKeys: readonly string[];
}

async function readProtectedLeaf(path: string, label: string): Promise<string> {
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error(`${label} must be a regular file`);
    const owner = process.getuid?.();
    if (owner !== undefined && metadata.uid !== owner)
      throw new Error(`${label} must be owned by the current user`);
    if ((metadata.mode & 0o777) !== 0o600)
      throw new Error(`${label} permissions must be exactly 0600`);
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

export async function readWorldSeed(path: string): Promise<Buffer> {
  const encoded = await readProtectedLeaf(path, 'world seed');
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) throw new Error('world seed is malformed');
  const seed = Buffer.from(encoded, 'base64url');
  if (seed.length !== 32 || seed.toString('base64url') !== encoded)
    throw new Error('world seed must contain exactly 32 canonical bytes');
  return seed;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

export async function readWorldManifest(path: string): Promise<WorldManifest> {
  const parsed: unknown = JSON.parse(await readProtectedLeaf(path, 'world manifest'));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('world manifest is malformed');
  const record = parsed as Record<string, unknown>;
  if (!exactKeys(record, ['version', 'digest', 'keys', 'completedKeys']))
    throw new Error('world manifest has unknown or missing fields');
  if (
    record['version'] !== 1 ||
    typeof record['digest'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record['digest']) ||
    !stringArray(record['keys']) ||
    !stringArray(record['completedKeys'])
  )
    throw new Error('world manifest is malformed');
  const keys = record['keys'];
  const completedKeys = record['completedKeys'];
  if (new Set(keys).size !== keys.length || new Set(completedKeys).size !== completedKeys.length)
    throw new Error('world manifest contains duplicate keys');
  if (!completedKeys.every((key) => keys.includes(key)))
    throw new Error('world manifest completion is not owned by this declaration');
  return {
    version: 1,
    digest: record['digest'],
    keys,
    completedKeys,
  };
}

export function declaredWorldManifest(world: HarnessWorld): WorldManifest {
  const byKey = <T extends { key: string }>(items: readonly T[]) =>
    [...items].sort((left, right) => left.key.localeCompare(right.key));
  const canonical = JSON.stringify({
    users: byKey(world.users),
    follows: byKey(world.follows ?? []),
    posts: byKey(world.posts ?? []),
  });
  const keys = [...world.users, ...(world.follows ?? []), ...(world.posts ?? [])]
    .map((item) => item.key)
    .sort();
  return {
    version: 1,
    digest: createHash('sha256').update(canonical).digest('hex'),
    keys,
    completedKeys: [],
  };
}

export function assertWorldCompatible(
  declared: WorldManifest,
  existing: WorldManifest | undefined,
): void {
  if (
    existing !== undefined &&
    (existing.digest !== declared.digest ||
      JSON.stringify(existing.keys) !== JSON.stringify(declared.keys))
  )
    throw new Error(
      'world drift/removal is unsupported by this slice; reset the disposable lab before changing the declaration',
    );
}
