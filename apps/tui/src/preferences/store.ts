import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { GlyphSetName } from '../theme/themes/types.js';

export const PREFERENCE_SCHEMA_VERSION = 1;

export interface PreferenceKey {
  readonly nodeOrigin: string;
  readonly actorId: string;
}

/**
 * How an image attaches inline — distinct from the per-row/viewer *placement* limits
 * (P12-018), which stay a node/terminal-capability concern.
 *
 * - `'auto'` — the best rendering the terminal supports (Kitty, then half-block art,
 *   then ascii art), same policy `createRenderer`'s own `'auto'` mode picks.
 * - `'pixel'` — force half-block art (or ascii, if colour truly isn't available),
 *   never the real Kitty protocol — useful on a Kitty-capable terminal the viewer
 *   would rather not spend Kitty's terminal-side placement budget on, or just
 *   prefers the look of.
 * - `'ascii'` — force the colourless luminance-ramp renderer, unconditionally.
 * - `'box'` — force the spec §75 description box, but still fetch/prepare the image
 *   (matches `createRenderer`'s `'box'` mode).
 * - `'off'` — never fetches or draws a placement at all; the §75 fallback box (alt
 *   text, dimensions) still always renders from the attachment's own metadata.
 *
 * No `'kitty'` value here on purpose: forcing the real graphics protocol against an
 * unconfirmed terminal is a footgun this preference row deliberately doesn't expose —
 * `'auto'` already uses it whenever the probe confirms support.
 */
export type ImagePolicy = 'auto' | 'pixel' | 'ascii' | 'box' | 'off';

/** Presentation preferences only. Credentials and session material never belong here. */
export interface LocalPreferences {
  readonly theme?: string | undefined;
  readonly plainMode?: boolean | undefined;
  readonly quietFeed?: boolean | undefined;
  readonly glyphSet?: GlyphSetName | undefined;
  readonly imagePolicy?: ImagePolicy | undefined;
  /** P12-118's linear/screen-reader mode — one column, no overlays/drawers, indexed
   * rows, plain mode implied. Lowest-precedence source: `--linear`/`PATCHES_LINEAR`
   * still win at launch (`App.tsx`), same precedence shape as `plainMode`. */
  readonly linearMode?: boolean | undefined;
}

export interface PreferenceStore {
  get(key: PreferenceKey): Promise<LocalPreferences | undefined>;
  set(key: PreferenceKey, preferences: LocalPreferences): Promise<void>;
  delete(key: PreferenceKey): Promise<void>;
}

interface StoredPreferenceEntry extends PreferenceKey {
  readonly preferences: LocalPreferences;
}

interface PreferenceDocument {
  readonly schemaVersion: typeof PREFERENCE_SCHEMA_VERSION;
  readonly profiles: readonly StoredPreferenceEntry[];
}

export interface PreferenceStoreFileOperations {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<unknown>;
  writeFile(
    path: string,
    data: string,
    options: { encoding: 'utf8'; mode: number; flag: 'wx' },
  ): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
}

const FILE_OPERATIONS: PreferenceStoreFileOperations = {
  readFile: (path, encoding) => readFile(path, encoding),
  mkdir: (path, options) => mkdir(path, options),
  writeFile: (path, data, options) => writeFile(path, data, options),
  chmod: (path, mode) => chmod(path, mode),
  rename: (from, to) => rename(from, to),
  rm: (path, options) => rm(path, options),
};

export interface FilePreferenceStoreOptions {
  readonly path?: string;
  readonly fileOperations?: PreferenceStoreFileOperations;
}

function configDir(): string {
  const configured = process.env.XDG_CONFIG_HOME?.trim();
  const base =
    configured === undefined || configured === '' ? join(homedir(), '.config') : configured;
  return join(base, 'patches');
}

export function preferenceFilePath(): string {
  return join(configDir(), 'preferences.json');
}

function keyString({ nodeOrigin, actorId }: PreferenceKey): string {
  return `${nodeOrigin}\u0000${actorId}`;
}

function assertKey(key: PreferenceKey): void {
  if (key.nodeOrigin.trim() === '' || key.actorId.trim() === '') {
    throw new TypeError('preference keys require a non-empty node origin and stable actor id');
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

const GLYPH_SET_NAMES: readonly GlyphSetName[] = ['unicode', 'nerd', 'ascii'];
const IMAGE_POLICIES: readonly ImagePolicy[] = ['auto', 'pixel', 'ascii', 'box', 'off'];

function isLocalPreferences(value: unknown): value is LocalPreferences {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'theme',
      'plainMode',
      'quietFeed',
      'glyphSet',
      'imagePolicy',
      'linearMode',
    ])
  ) {
    return false;
  }
  return (
    (value.theme === undefined || (typeof value.theme === 'string' && value.theme.trim() !== '')) &&
    (value.plainMode === undefined || typeof value.plainMode === 'boolean') &&
    (value.quietFeed === undefined || typeof value.quietFeed === 'boolean') &&
    (value.glyphSet === undefined ||
      (typeof value.glyphSet === 'string' &&
        GLYPH_SET_NAMES.includes(value.glyphSet as GlyphSetName))) &&
    (value.imagePolicy === undefined ||
      (typeof value.imagePolicy === 'string' &&
        IMAGE_POLICIES.includes(value.imagePolicy as ImagePolicy))) &&
    (value.linearMode === undefined || typeof value.linearMode === 'boolean')
  );
}

function isStoredEntry(value: unknown): value is StoredPreferenceEntry {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['nodeOrigin', 'actorId', 'preferences']) &&
    typeof value.nodeOrigin === 'string' &&
    value.nodeOrigin.trim() !== '' &&
    typeof value.actorId === 'string' &&
    value.actorId.trim() !== '' &&
    isLocalPreferences(value.preferences)
  );
}

function parseDocument(raw: string): PreferenceDocument | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  if (
    !isRecord(parsed) ||
    !hasOnlyKeys(parsed, ['schemaVersion', 'profiles']) ||
    parsed.schemaVersion !== PREFERENCE_SCHEMA_VERSION ||
    !Array.isArray(parsed.profiles) ||
    !parsed.profiles.every(isStoredEntry)
  ) {
    return undefined;
  }
  return { schemaVersion: PREFERENCE_SCHEMA_VERSION, profiles: parsed.profiles };
}

function copyPreferences(preferences: LocalPreferences): LocalPreferences {
  if (!isLocalPreferences(preferences)) {
    throw new TypeError(
      'preferences must contain only theme, plainMode, quietFeed, glyphSet, imagePolicy, and linearMode',
    );
  }
  return {
    ...(preferences.theme === undefined ? {} : { theme: preferences.theme.trim() }),
    ...(preferences.plainMode === undefined ? {} : { plainMode: preferences.plainMode }),
    ...(preferences.quietFeed === undefined ? {} : { quietFeed: preferences.quietFeed }),
    ...(preferences.glyphSet === undefined ? {} : { glyphSet: preferences.glyphSet }),
    ...(preferences.imagePolicy === undefined ? {} : { imagePolicy: preferences.imagePolicy }),
    ...(preferences.linearMode === undefined ? {} : { linearMode: preferences.linearMode }),
  };
}

const EMPTY_DOCUMENT: PreferenceDocument = Object.freeze({
  schemaVersion: PREFERENCE_SCHEMA_VERSION,
  profiles: Object.freeze([]),
});

export class FilePreferenceStore implements PreferenceStore {
  private readonly path: string;
  private readonly operations: PreferenceStoreFileOperations;

  constructor(options: FilePreferenceStoreOptions = {}) {
    this.path = options.path ?? preferenceFilePath();
    this.operations = options.fileOperations ?? FILE_OPERATIONS;
  }

  private async readDocument(): Promise<PreferenceDocument> {
    let raw: string;
    try {
      raw = await this.operations.readFile(this.path, 'utf8');
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return EMPTY_DOCUMENT;
      throw error;
    }
    return parseDocument(raw) ?? EMPTY_DOCUMENT;
  }

  private async writeDocument(profiles: readonly StoredPreferenceEntry[]): Promise<void> {
    await this.operations.mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.path}.${String(process.pid)}.${randomUUID()}.tmp`;
    const document: PreferenceDocument = { schemaVersion: PREFERENCE_SCHEMA_VERSION, profiles };
    try {
      await this.operations.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      await this.operations.chmod(temporaryPath, 0o600);
      await this.operations.rename(temporaryPath, this.path);
    } catch (error) {
      await this.operations.rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async get(key: PreferenceKey): Promise<LocalPreferences | undefined> {
    assertKey(key);
    const found = (await this.readDocument()).profiles.find(
      (entry) => keyString(entry) === keyString(key),
    );
    return found === undefined ? undefined : copyPreferences(found.preferences);
  }

  async set(key: PreferenceKey, preferences: LocalPreferences): Promise<void> {
    assertKey(key);
    const profiles = (await this.readDocument()).profiles.filter(
      (entry) => keyString(entry) !== keyString(key),
    );
    await this.writeDocument([
      ...profiles,
      {
        nodeOrigin: key.nodeOrigin,
        actorId: key.actorId,
        preferences: copyPreferences(preferences),
      },
    ]);
  }

  async delete(key: PreferenceKey): Promise<void> {
    assertKey(key);
    const profiles = (await this.readDocument()).profiles.filter(
      (entry) => keyString(entry) !== keyString(key),
    );
    await this.writeDocument(profiles);
  }
}

export class MemoryPreferenceStore implements PreferenceStore {
  private readonly profiles = new Map<string, LocalPreferences>();

  get(key: PreferenceKey): Promise<LocalPreferences | undefined> {
    assertKey(key);
    const preferences = this.profiles.get(keyString(key));
    return Promise.resolve(preferences === undefined ? undefined : copyPreferences(preferences));
  }

  set(key: PreferenceKey, preferences: LocalPreferences): Promise<void> {
    assertKey(key);
    this.profiles.set(keyString(key), copyPreferences(preferences));
    return Promise.resolve();
  }

  delete(key: PreferenceKey): Promise<void> {
    assertKey(key);
    this.profiles.delete(keyString(key));
    return Promise.resolve();
  }
}
