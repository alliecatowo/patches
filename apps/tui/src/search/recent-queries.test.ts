import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FileRecentQueriesStore,
  MemoryRecentQueriesStore,
  RECENT_QUERY_LIMIT,
} from './recent-queries.js';

describe('MemoryRecentQueriesStore', () => {
  it('moves a re-run query to the front instead of duplicating it', async () => {
    const store = new MemoryRecentQueriesStore(['old']);
    await store.add('one');
    await store.add('two');
    expect(await store.add('one')).toEqual(['one', 'two', 'old']);
  });

  it('is a no-op for a blank query', async () => {
    const store = new MemoryRecentQueriesStore(['kept']);
    expect(await store.add('   ')).toEqual(['kept']);
  });

  it('caps at RECENT_QUERY_LIMIT, dropping the oldest', async () => {
    const store = new MemoryRecentQueriesStore();
    for (let index = 0; index < RECENT_QUERY_LIMIT + 5; index += 1) {
      await store.add(`query-${String(index)}`);
    }
    const stored = await store.load();
    expect(stored).toHaveLength(RECENT_QUERY_LIMIT);
    expect(stored[0]).toBe(`query-${String(RECENT_QUERY_LIMIT + 4)}`);
  });
});

describe('FileRecentQueriesStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'patches-recent-queries-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('loads an empty list when no file exists yet', async () => {
    const store = new FileRecentQueriesStore(join(dir, 'nested', 'recent-searches.json'));
    expect(await store.load()).toEqual([]);
  });

  it('persists across store instances and creates parent directories', async () => {
    const path = join(dir, 'nested', 'recent-searches.json');
    await new FileRecentQueriesStore(path).add('rust release');
    const reopened = new FileRecentQueriesStore(path);
    expect(await reopened.load()).toEqual(['rust release']);
    const raw = await readFile(path, 'utf8');
    expect(JSON.parse(raw)).toEqual(['rust release']);
  });
});
