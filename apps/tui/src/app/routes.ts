import type { Screen } from './keymap.js';
import { currentEntry, type NavEntry, type NavStack } from './navigation.js';

/**
 * How a route wants to be *presented* — never where it sits in history.
 *
 * ADR 0018 / `docs/architecture/tui-interaction-model.md` §3.2: there is no separate
 * split-view state. The single `NavStack` is rendered differently per width tier, and
 * a route's `kind` is the only input that decision needs. That is what makes the
 * acceptance criterion testable: resizing 140 → 100 columns changes the presentation
 * and provably leaves the stack (and therefore `Esc`) identical.
 */
export type RouteKind = 'list' | 'detail' | 'full';

export const ROUTE_KINDS: Readonly<Record<Screen, RouteKind>> = {
  // Lists — a column of selectable rows; the left pane in a split.
  home: 'list',
  local: 'list',
  profile: 'list',
  bookmarks: 'list',
  notifications: 'list',
  search: 'list',
  tagFeed: 'list',
  communities: 'list',
  messages: 'list',
  followRequests: 'list',
  // Details — one thing, opened from a list; the right pane in a split.
  thread: 'detail',
  page: 'detail',
  postHistory: 'detail',
  media: 'detail',
  // Full — owns the whole content region even at `ultra`, because it is a task
  // rather than a view (text entry, credentials, settings, the help reference).
  compose: 'full',
  postEdit: 'full',
  login: 'full',
  accounts: 'full',
  editProfile: 'full',
  preferences: 'full',
  help: 'full',
  report: 'full',
  privacy: 'full',
  filters: 'full',
  filterLists: 'full',
  labelers: 'full',
  appeals: 'full',
  moderationLog: 'full',
};

export function routeKind(screen: Screen): RouteKind {
  return ROUTE_KINDS[screen];
}

/** The nearest entry *below* the top of the stack that is a list, if any. */
export function nearestListBeneath(stack: NavStack): NavEntry | undefined {
  for (let index = stack.length - 2; index >= 0; index -= 1) {
    const entry = stack[index];
    if (entry !== undefined && routeKind(entry.screen) === 'list') return entry;
  }
  return undefined;
}

/**
 * True when this stack *would like* two panes. Whether it gets them is the layout
 * plan's call (`planResponsiveLayout`), which knows the terminal width — so this stays
 * a pure function of history and the split stays a pure function of size.
 */
export function wantsSplit(stack: NavStack): boolean {
  const top = currentEntry(stack);
  if (routeKind(top.screen) !== 'detail') return false;
  return nearestListBeneath(stack) !== undefined;
}

export type Presentation =
  { mode: 'single'; primary: NavEntry } | { mode: 'split'; primary: NavEntry; secondary: NavEntry };

/**
 * Which entries are on screen, given the stack and whether the layout granted a
 * split. `granted` is `LayoutPlan.mode === 'split'`.
 */
export function presentationFor(stack: NavStack, granted: boolean): Presentation {
  const top = currentEntry(stack);
  if (!granted) return { mode: 'single', primary: top };
  const list = nearestListBeneath(stack);
  if (list === undefined || routeKind(top.screen) !== 'detail') {
    return { mode: 'single', primary: top };
  }
  return { mode: 'split', primary: list, secondary: top };
}
