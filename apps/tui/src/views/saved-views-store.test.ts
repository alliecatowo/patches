import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FileSavedViewsStore,
  MemorySavedViewsStore,
  type SavedViewsKey,
} from './saved-views-store.js';

const ALICE: SavedViewsKey = { nodeOrigin: 'https://patches.example', actorId: 'actor-1' };
const BOB: SavedViewsKey = { nodeOrigin: 'https://patches.example', actorId: 'actor-2' };

describe('MemorySavedViewsStore', () => {
  it('creates, lists, renames, and removes views scoped by key', async () => {
    const store = new MemorySavedViewsStore();
    const created = await store.create(ALICE, ' Cats ', { kind: 'tag', tag: 'cats' });
    expect(created?.name).toBe('Cats');
    expect(created?.source).toEqual({ kind: 'tag', tag: 'cats' });

    await expect(store.list(ALICE)).resolves.toHaveLength(1);
    await expect(store.list(BOB)).resolves.toEqual([]);

    await store.rename(ALICE, created!.id, 'Kittens');
    const renamed = await store.list(ALICE);
    expect(renamed[0]?.name).toBe('Kittens');

    await store.remove(ALICE, created!.id);
    await expect(store.list(ALICE)).resolves.toEqual([]);
  });

  it('rejects an empty/whitespace-only name', async () => {
    const store = new MemorySavedViewsStore();
    await expect(store.create(ALICE, '   ', { kind: 'home' })).resolves.toBeUndefined();
  });
});

describe('FileSavedViewsStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'patches-saved-views-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('persists views to disk across store instances', async () => {
    const path = join(dir, 'saved-views.json');
    const first = new FileSavedViewsStore({ path });
    await first.create(ALICE, 'Local news', { kind: 'local' });

    const second = new FileSavedViewsStore({ path });
    const views = await second.list(ALICE);
    expect(views).toHaveLength(1);
    expect(views[0]?.name).toBe('Local news');
  });

  it('ignores a corrupt file and starts empty rather than crashing', async () => {
    const path = join(dir, 'saved-views.json');
    await import('node:fs/promises').then(({ mkdir, writeFile }) =>
      mkdir(dir, { recursive: true }).then(() => writeFile(path, 'not json', 'utf8')),
    );
    const store = new FileSavedViewsStore({ path });
    await expect(store.list(ALICE)).resolves.toEqual([]);
  });
});
