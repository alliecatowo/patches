import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** How many recent search queries survive a restart (P12-115). */
export const RECENT_QUERY_LIMIT = 20;

/**
 * Recall for the search query field (`Up`/`Down` in `SearchScreen`) — disposable local
 * state, not configuration, so it lives under `XDG_DATA_HOME` next to the compose draft
 * (`compose/draft-store.ts`), not `XDG_CONFIG_HOME`.
 */
export interface RecentQueriesStore {
  load(): Promise<readonly string[]>;
  /** Moves `query` to the front, de-duplicated, capped at `RECENT_QUERY_LIMIT`. A
   * blank query is a no-op — there is nothing worth recalling. */
  add(query: string): Promise<readonly string[]>;
}

function dataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  const base = xdg !== undefined && xdg.trim() !== '' ? xdg : join(homedir(), '.local', 'share');
  return join(base, 'patches');
}

export function recentQueriesFilePath(): string {
  return join(dataDir(), 'recent-searches.json');
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function withRecalled(current: readonly string[], query: string): string[] {
  const trimmed = query.trim();
  if (trimmed === '') return [...current];
  const deduped = current.filter((existing) => existing !== trimmed);
  return [trimmed, ...deduped].slice(0, RECENT_QUERY_LIMIT);
}

/** The real backend: one JSON file under the XDG data dir, most-recent-first. */
export class FileRecentQueriesStore implements RecentQueriesStore {
  private readonly path: string;

  constructor(path: string = recentQueriesFilePath()) {
    this.path = path;
  }

  async load(): Promise<readonly string[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return [];
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A truncated or corrupt recall file (a crash mid-write, or a reader racing a writer) is
      // worth an empty history, not a rejected promise that no caller can act on.
      return [];
    }
    return isStringArray(parsed) ? parsed.slice(0, RECENT_QUERY_LIMIT) : [];
  }

  async add(query: string): Promise<readonly string[]> {
    const next = withRecalled(await this.load(), query);
    await mkdir(dirname(this.path), { recursive: true });
    // Write-then-rename so a concurrent `load` sees either the old file or the new one, never
    // a half-written JSON document.
    const temp = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await rename(temp, this.path);
    return next;
  }
}

/** Tests, and anywhere recall should live only for the process lifetime. */
export class MemoryRecentQueriesStore implements RecentQueriesStore {
  private queries: readonly string[];

  constructor(initial: readonly string[] = []) {
    this.queries = initial;
  }

  load(): Promise<readonly string[]> {
    return Promise.resolve(this.queries);
  }

  add(query: string): Promise<readonly string[]> {
    this.queries = withRecalled(this.queries, query);
    return Promise.resolve(this.queries);
  }
}
