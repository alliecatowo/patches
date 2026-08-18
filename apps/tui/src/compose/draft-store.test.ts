import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileDraftStore, MemoryDraftStore, type ComposeDraft } from './draft-store.js';

const DRAFT: ComposeDraft = { body: 'finally finished the synth rack', clientRequestId: 'req-1' };

describe('MemoryDraftStore', () => {
  it('starts empty and round-trips a saved draft', async () => {
    const store = new MemoryDraftStore();
    await expect(store.load()).resolves.toBeUndefined();

    await store.save(DRAFT);
    await expect(store.load()).resolves.toEqual(DRAFT);

    await store.clear();
    await expect(store.load()).resolves.toBeUndefined();
  });
});

describe('FileDraftStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'patches-draft-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('resolves undefined when nothing has been saved yet', async () => {
    const store = new FileDraftStore(join(dir, 'compose-draft.json'));
    await expect(store.load()).resolves.toBeUndefined();
  });

  it('survives a process restart — reads back what a previous instance wrote', async () => {
    const path = join(dir, 'compose-draft.json');
    await new FileDraftStore(path).save(DRAFT);

    const reopened = new FileDraftStore(path);
    await expect(reopened.load()).resolves.toEqual(DRAFT);
  });

  it('clear() removes the file so a fresh load resolves undefined', async () => {
    const path = join(dir, 'compose-draft.json');
    const store = new FileDraftStore(path);
    await store.save(DRAFT);
    await store.clear();

    await expect(store.load()).resolves.toBeUndefined();
  });

  it('creates the parent directory on first save', async () => {
    const path = join(dir, 'nested', 'compose-draft.json');
    const store = new FileDraftStore(path);
    await store.save(DRAFT);

    await expect(new FileDraftStore(path).load()).resolves.toEqual(DRAFT);
  });
});
