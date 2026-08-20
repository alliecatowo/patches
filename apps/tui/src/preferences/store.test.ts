import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FilePreferenceStore,
  MemoryPreferenceStore,
  PREFERENCE_SCHEMA_VERSION,
  type LocalPreferences,
  type PreferenceKey,
  type PreferenceStoreFileOperations,
} from './store.js';

const ALICE: PreferenceKey = { nodeOrigin: 'https://patches.example', actorId: 'actor-1' };
const BOB: PreferenceKey = { nodeOrigin: 'https://patches.example', actorId: 'actor-2' };
const REMOTE_ALICE: PreferenceKey = {
  nodeOrigin: 'https://social.example',
  actorId: 'actor-1',
};

describe('MemoryPreferenceStore', () => {
  it('isolates preferences by both node origin and stable actor id', async () => {
    const store = new MemoryPreferenceStore();
    await store.set(ALICE, { theme: 'paper' });
    await store.set(BOB, { theme: 'mono' });
    await store.set(REMOTE_ALICE, { theme: 'hacker' });

    await expect(store.get(ALICE)).resolves.toEqual({ theme: 'paper' });
    await expect(store.get(BOB)).resolves.toEqual({ theme: 'mono' });
    await expect(store.get(REMOTE_ALICE)).resolves.toEqual({ theme: 'hacker' });
  });

  it('deletes only the selected profile', async () => {
    const store = new MemoryPreferenceStore();
    await store.set(ALICE, { plainMode: true });
    await store.set(BOB, { quietFeed: true });
    await store.delete(ALICE);

    await expect(store.get(ALICE)).resolves.toBeUndefined();
    await expect(store.get(BOB)).resolves.toEqual({ quietFeed: true });
  });

  it('round-trips glyphSet and imagePolicy', async () => {
    const store = new MemoryPreferenceStore();
    await store.set(ALICE, { glyphSet: 'ascii', imagePolicy: 'off' });
    await expect(store.get(ALICE)).resolves.toEqual({ glyphSet: 'ascii', imagePolicy: 'off' });
  });

  it('round-trips every imagePolicy value, including the newer pixel/ascii/box modes', async () => {
    const store = new MemoryPreferenceStore();
    for (const imagePolicy of ['auto', 'pixel', 'ascii', 'box', 'off'] as const) {
      await store.set(ALICE, { imagePolicy });
      await expect(store.get(ALICE)).resolves.toEqual({ imagePolicy });
    }
  });

  it('round-trips linearMode', async () => {
    const store = new MemoryPreferenceStore();
    await store.set(ALICE, { linearMode: true });
    await expect(store.get(ALICE)).resolves.toEqual({ linearMode: true });
  });

  it('rejects an unrecognized glyphSet or imagePolicy value', () => {
    const store = new MemoryPreferenceStore();
    // Deliberately malformed input — simulates a hand-edited preferences.json, not a type
    // a caller could produce through `LocalPreferences` itself.
    const badGlyphSet = { glyphSet: 'comic-sans' } as unknown as LocalPreferences;
    const badImagePolicy = { imagePolicy: 'always' } as unknown as LocalPreferences;
    // `MemoryPreferenceStore.set` isn't declared `async`, so the validation throw is
    // synchronous rather than a rejection — unlike `FilePreferenceStore` below.
    expect(() => store.set(ALICE, badGlyphSet)).toThrow(TypeError);
    expect(() => store.set(ALICE, badImagePolicy)).toThrow(TypeError);
  });
});

describe('FilePreferenceStore', () => {
  let directory: string;
  let path: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'patches-preferences-'));
    path = join(directory, 'nested', 'preferences.json');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('persists a versioned document atomically with mode 0600', async () => {
    const renames: [string, string][] = [];
    const operations: PreferenceStoreFileOperations = {
      readFile: (file, encoding) => readFile(file, encoding),
      mkdir: (dir, options) => mkdir(dir, options),
      writeFile: (file, data, options) => writeFile(file, data, options),
      chmod: (file, mode) => chmod(file, mode),
      rename: async (from, to) => {
        renames.push([from, to]);
        await rename(from, to);
      },
      rm: (file, options) => rm(file, options),
    };
    const store = new FilePreferenceStore({ path, fileOperations: operations });
    await store.set(ALICE, { theme: 'pastel', plainMode: false, quietFeed: true });

    expect(renames).toHaveLength(1);
    expect(renames[0]?.[0]).toMatch(/\.tmp$/);
    expect(renames[0]?.[1]).toBe(path);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      schemaVersion: PREFERENCE_SCHEMA_VERSION,
    });
    await expect(new FilePreferenceStore({ path }).get(ALICE)).resolves.toEqual({
      theme: 'pastel',
      plainMode: false,
      quietFeed: true,
    });
  });

  it('leaves the previous document intact when the atomic rename fails', async () => {
    await new FilePreferenceStore({ path }).set(ALICE, { theme: 'paper' });
    const operations: PreferenceStoreFileOperations = {
      readFile: (file, encoding) => readFile(file, encoding),
      mkdir: (dir, options) => mkdir(dir, options),
      writeFile: (file, data, options) => writeFile(file, data, options),
      chmod: (file, mode) => chmod(file, mode),
      rename: () => Promise.reject(new Error('simulated rename failure')),
      rm: (file, options) => rm(file, options),
    };
    const failing = new FilePreferenceStore({ path, fileOperations: operations });

    await expect(failing.set(ALICE, { theme: 'hacker' })).rejects.toThrow(
      'simulated rename failure',
    );
    await expect(new FilePreferenceStore({ path }).get(ALICE)).resolves.toEqual({
      theme: 'paper',
    });
    expect(
      (await readdir(join(directory, 'nested'))).filter((name) => name.endsWith('.tmp')),
    ).toEqual([]);
  });

  it.each([
    ['corrupt JSON', '{'],
    ['unknown schema', JSON.stringify({ schemaVersion: 99, profiles: [] })],
    [
      'unknown fields',
      JSON.stringify({
        schemaVersion: PREFERENCE_SCHEMA_VERSION,
        profiles: [{ ...ALICE, preferences: { theme: 'paper', refreshToken: 'never' } }],
      }),
    ],
  ])('falls back to empty for %s', async (_label, raw) => {
    await mkdir(join(directory, 'nested'), { recursive: true });
    await writeFile(path, raw, 'utf8');
    await expect(new FilePreferenceStore({ path }).get(ALICE)).resolves.toBeUndefined();
  });

  it('preserves an unknown theme name so resolution can report it actionably', async () => {
    await mkdir(join(directory, 'nested'), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: PREFERENCE_SCHEMA_VERSION,
        profiles: [{ ...ALICE, preferences: { theme: 'future-theme' } }],
      }),
      'utf8',
    );
    await expect(new FilePreferenceStore({ path }).get(ALICE)).resolves.toEqual({
      theme: 'future-theme',
    });
  });

  it('serializes only presentation fields and never credentials', async () => {
    const store = new FilePreferenceStore({ path });
    const unsafeInput = { theme: 'paper', refreshToken: 'secret' };
    await expect(store.set(ALICE, unsafeInput)).rejects.toThrow(/only theme/);
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
