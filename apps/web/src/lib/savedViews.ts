/**
 * User-directed feed views (#192): named, client-persisted compositions over the
 * *existing* chronological timeline RPCs (home/local/tag/community) — never a new
 * ranking or a `sort`/`order` parameter (Amendment B §194). A view only remembers
 * which existing RPC + params to call; the RPC itself still returns strict keyset-
 * cursor chronological pages, so a view can't reposition anything.
 */

export type SavedViewSource =
  | { readonly kind: 'home' }
  | { readonly kind: 'local' }
  | { readonly kind: 'tag'; readonly tag: string }
  | { readonly kind: 'community'; readonly communityId: string; readonly communityName: string };

export interface SavedView {
  readonly id: string;
  readonly name: string;
  readonly source: SavedViewSource;
  readonly createdAt: string;
}

const STORAGE_KEY = 'patches.web.saved-views.v1';
const MAX_NAME_LENGTH = 60;
/** Sane upper bound so a runaway create loop can't grow localStorage unbounded. */
const MAX_VIEWS = 50;

type Listener = () => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSource(value: unknown): value is SavedViewSource {
  if (!isRecord(value) || typeof value['kind'] !== 'string') return false;
  switch (value['kind']) {
    case 'home':
    case 'local':
      return true;
    case 'tag':
      return typeof value['tag'] === 'string' && value['tag'].trim() !== '';
    case 'community':
      return (
        typeof value['communityId'] === 'string' &&
        value['communityId'].trim() !== '' &&
        typeof value['communityName'] === 'string'
      );
    default:
      return false;
  }
}

function isSavedView(value: unknown): value is SavedView {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'].trim() !== '' &&
    typeof value['name'] === 'string' &&
    value['name'].trim() !== '' &&
    typeof value['createdAt'] === 'string' &&
    isSource(value['source'])
  );
}

function readAll(): SavedView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSavedView) : [];
  } catch {
    // Corrupt/unavailable storage degrades to "no saved views", not a crash.
    return [];
  }
}

function writeAll(views: readonly SavedView[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // Best-effort persistence; the in-memory `views` still reflects this session.
  }
}

let views: SavedView[] = readAll();
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent): void {
  if (event.storageArea !== null && event.storageArea !== window.localStorage) return;
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  views = readAll();
  notify();
}

if (typeof window !== 'undefined') window.addEventListener('storage', handleStorage);

export function getSavedViews(): readonly SavedView[] {
  return views;
}

export function subscribeSavedViews(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function sourceLabel(source: SavedViewSource): string {
  switch (source.kind) {
    case 'home':
      return 'Home';
    case 'local':
      return 'Everyone here';
    case 'tag':
      return `#${source.tag}`;
    case 'community':
      return source.communityName;
  }
}

export function createSavedView(name: string, source: SavedViewSource): SavedView | undefined {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (trimmed === '' || views.length >= MAX_VIEWS) return undefined;
  const view: SavedView = {
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}`,
    name: trimmed,
    source,
    createdAt: new Date().toISOString(),
  };
  views = [...views, view];
  writeAll(views);
  notify();
  return view;
}

export function renameSavedView(id: string, name: string): void {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (trimmed === '') return;
  views = views.map((view) => (view.id === id ? { ...view, name: trimmed } : view));
  writeAll(views);
  notify();
}

export function deleteSavedView(id: string): void {
  views = views.filter((view) => view.id !== id);
  writeAll(views);
  notify();
}
