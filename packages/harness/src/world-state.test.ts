import { mkdtemp, rm, chmod, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readWorld } from './actions.js';
import { declaredWorldManifest, readWorldManifest, readWorldSeed } from './world-state.js';

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'patches-world-state-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('protected world state', () => {
  it('accepts only canonical 32-byte 0600 seed material', async () => {
    const root = await temporaryRoot();
    const seedPath = join(root, 'seed');
    const encoded = Buffer.alloc(32, 7).toString('base64url');
    await writeFile(seedPath, encoded, { mode: 0o600 });
    await expect(readWorldSeed(seedPath)).resolves.toEqual(Buffer.alloc(32, 7));

    await chmod(seedPath, 0o644);
    await expect(readWorldSeed(seedPath)).rejects.toThrow('0600');
    await chmod(seedPath, 0o600);
    await writeFile(seedPath, 'short');
    await expect(readWorldSeed(seedPath)).rejects.toThrow('malformed');
  });

  it('rejects symlinked seed and manifest leaves', async () => {
    const root = await temporaryRoot();
    const target = join(root, 'target');
    await writeFile(target, Buffer.alloc(32, 1).toString('base64url'), { mode: 0o600 });
    const seedLink = join(root, 'seed-link');
    await symlink(target, seedLink);
    await expect(readWorldSeed(seedLink)).rejects.toThrow();

    const manifestLink = join(root, 'manifest-link');
    await symlink(target, manifestLink);
    await expect(readWorldManifest(manifestLink)).rejects.toThrow();
  });

  it('strictly validates manifest fields, types, ownership, and mode', async () => {
    const root = await temporaryRoot();
    const path = join(root, 'manifest');
    const manifest = declaredWorldManifest({
      users: [{ key: 'alice', handle: 'alice', email: 'alice@harness.local' }],
    });
    await writeFile(path, JSON.stringify(manifest), { mode: 0o600 });
    await expect(readWorldManifest(path)).resolves.toEqual(manifest);

    await writeFile(path, JSON.stringify({ ...manifest, surprise: true }), { mode: 0o600 });
    await expect(readWorldManifest(path)).rejects.toThrow('unknown');
    await writeFile(path, JSON.stringify({ ...manifest, completedKeys: ['not-owned'] }), {
      mode: 0o600,
    });
    await expect(readWorldManifest(path)).rejects.toThrow('not owned');
    await chmod(path, 0o666);
    await expect(readWorldManifest(path)).rejects.toThrow('0600');
  });

  it('rejects unknown and secret-bearing world properties recursively', async () => {
    const root = await temporaryRoot();
    const path = join(root, 'world.json');
    await writeFile(
      path,
      JSON.stringify({
        users: [
          {
            key: 'alice',
            handle: 'alice',
            email: 'alice@harness.local',
            nested: { refreshToken: 'must-not-enter' },
          },
        ],
      }),
    );
    await expect(readWorld(path)).rejects.toThrow('contain no credentials');
    await writeFile(
      path,
      JSON.stringify({
        users: [{ key: 'alice', handle: 'alice', email: 'alice@harness.local' }],
        unknown: true,
      }),
    );
    await expect(readWorld(path)).rejects.toThrow('stable keys');
  });
});
