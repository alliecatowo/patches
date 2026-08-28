import { useSyncExternalStore } from 'react';

import {
  createSavedView,
  deleteSavedView,
  getSavedViews,
  renameSavedView,
  subscribeSavedViews,
  type SavedView,
  type SavedViewSource,
} from '../lib/savedViews.js';

export interface UseSavedViewsResult {
  readonly views: readonly SavedView[];
  readonly create: (name: string, source: SavedViewSource) => SavedView | undefined;
  readonly rename: (id: string, name: string) => void;
  readonly remove: (id: string) => void;
}

const EMPTY: readonly SavedView[] = [];

/** Client-persisted saved views (#192) — no server state, nothing to gate on a session. */
export function useSavedViews(): UseSavedViewsResult {
  const views = useSyncExternalStore(subscribeSavedViews, getSavedViews, () => EMPTY);
  return { views, create: createSavedView, rename: renameSavedView, remove: deleteSavedView };
}
