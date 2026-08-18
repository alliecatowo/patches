import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * An in-progress page-document edit (P45-006), persisted the same way
 * `compose/draft-store.ts` persists an unsent post (spec §80's "MVP SHOULD persist
 * unsent … drafts locally", extended here to page edits since `$EDITOR` round-trips are
 * exactly the kind of longer-lived, crash-risking edit that rule exists for). Holds raw
 * text rather than a parsed `PatchesPage` — the whole point is surviving a document that
 * doesn't parse yet (a validation error the user hasn't fixed), which a typed draft
 * couldn't represent.
 */
export interface PageDraft {
  handle: string;
  rawJson: string;
}

export interface PageDraftStore {
  load(): Promise<PageDraft | undefined>;
  save(draft: PageDraft): Promise<void>;
  clear(): Promise<void>;
}

function dataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  const base = xdg !== undefined && xdg.trim() !== '' ? xdg : join(homedir(), '.local', 'share');
  return join(base, 'patches');
}

export function pageDraftFilePath(): string {
  return join(dataDir(), 'page-edit-draft.json');
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isPageDraft(value: unknown): value is PageDraft {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PageDraft>;
  return typeof candidate.handle === 'string' && typeof candidate.rawJson === 'string';
}

export class FilePageDraftStore implements PageDraftStore {
  private readonly path: string;

  constructor(path: string = pageDraftFilePath()) {
    this.path = path;
  }

  async load(): Promise<PageDraft | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return undefined;
      throw error;
    }
    const parsed: unknown = JSON.parse(raw);
    return isPageDraft(parsed) ? parsed : undefined;
  }

  async save(draft: PageDraft): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }
}

export class MemoryPageDraftStore implements PageDraftStore {
  private draft: PageDraft | undefined;

  load(): Promise<PageDraft | undefined> {
    return Promise.resolve(this.draft);
  }

  save(draft: PageDraft): Promise<void> {
    this.draft = draft;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.draft = undefined;
    return Promise.resolve();
  }
}
