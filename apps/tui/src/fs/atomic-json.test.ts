import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileCredentialStore } from '../auth/credential-store.js';
import { FileDraftStore } from '../compose/draft-store.js';
import { FilePageDraftStore } from '../pages/draft-store.js';
import { describeCrash } from '../terminal/cleanup.js';
import { readJsonOr, writeFileAtomic } from './atomic-json.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'patches-atomic-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('corrupt state files do not crash launch', () => {
  it('compose draft store loads undefined for truncated JSON and quarantines it', async () => {
    const path = join(dir, 'compose-draft.json');
    await writeFile(path, '{"body": "half a dra');
    await expect(new FileDraftStore(path).load()).resolves.toBeUndefined();
    expect((await readdir(dir)).some((name) => name.includes('.corrupt-'))).toBe(true);
  });

  it('page draft store loads undefined for truncated JSON', async () => {
    const path = join(dir, 'page-draft.json');
    await writeFile(path, '{"handle":');
    await expect(new FilePageDraftStore(path).load()).resolves.toBeUndefined();
  });

  it('credential store treats a corrupt file as empty', async () => {
    const path = join(dir, 'credentials.json');
    await writeFile(path, '[{"nodeOrigin":');
    const store = new FileCredentialStore({ allowInsecure: true, path, warn: () => undefined });
    await expect(store.get('patches.example:443')).resolves.toBeUndefined();
    await expect(store.list()).resolves.toEqual([]);
  });
});

describe('writeFileAtomic', () => {
  it('keeps overlapping writes valid and ordered (last write wins)', async () => {
    const path = join(dir, 'state.json');
    const writes = Array.from({ length: 20 }, (_, index) =>
      writeFileAtomic(path, JSON.stringify({ n: index, pad: 'x'.repeat(20 - index) })),
    );
    await Promise.all(writes);
    const parsed = JSON.parse(await readFile(path, 'utf8')) as { n: number };
    expect(parsed.n).toBe(19);
    expect(await readdir(dir)).toEqual(['state.json']);
  });

  it('readJsonOr returns the fallback for a missing file', async () => {
    await expect(readJsonOr(join(dir, 'nope.json'), 7)).resolves.toBe(7);
  });
});

describe('describeCrash', () => {
  it('is a single line with no stack trace', () => {
    const text = describeCrash(new Error('boom\n    at somewhere (file.js:1:1)'));
    expect(text).not.toContain('\n');
    expect(text).not.toContain('at somewhere');
    expect(text).toContain('boom');
  });
});
