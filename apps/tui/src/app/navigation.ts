import type { Actor, MediaAttachment, Tag } from '../api/wire/types.js';

import type { ReportTarget } from '../screens/ReportScreen.js';
import { isRootScreen, type RootScreen, type Screen } from './keymap.js';

/**
 * A real navigation stack (owner feedback, 2026-08-18: "esc doesn't always go back,
 * sometimes you get in a screen and have to enter another one to get out").
 *
 * Every screen you can be on is an entry on this stack, and every entry carries the
 * *whole* of what that screen needs to render. That is the fix: the old shell kept a
 * single `priorScreen` plus separate `profileTarget`/`pageTarget`/`threadStack`/
 * `reportTarget` states, so going profile → thread → author profile → Esc left the
 * profile screen pointing at the wrong actor, and some screens had no `Esc` handler
 * at all. With the payload on the stack, `Esc` is always exactly `pop()` and it can
 * never land on a screen whose data has been overwritten.
 *
 * Pure functions, no React — unit-tested in `navigation.test.ts`.
 */
type NavEntryVariant =
  | {
      screen: Exclude<
        Screen,
        'profile' | 'thread' | 'page' | 'report' | 'postHistory' | 'media' | 'postEdit' | 'tagFeed'
      >;
    }
  | { screen: 'profile'; actorId: string; knownActor: Actor | undefined }
  | { screen: 'thread'; postId: string }
  | { screen: 'postHistory'; postId: string }
  | { screen: 'page'; handle: string; slug: string }
  | { screen: 'report'; target: ReportTarget }
  /** `#`/search's tags tab/`:tag` (P12-115) — the tag travels on the stack entry, same
   * "no second fetch, `Esc` is still a `pop`" reasoning as `profile`/`page` above. */
  | { screen: 'tagFeed'; tag: Tag }
  /** `o` on a post that carries media (P12-018/P12-127) — the attachments travel on
   * the stack entry so the viewer needs no second fetch and `Esc` is still a `pop`. */
  | {
      screen: 'media';
      postId: string;
      attachments: readonly MediaAttachment[];
      initialIndex: number;
    }
  /** `E` on one of your own posts (P12-125) — compose in edit mode, seeded with the
   * body as it stands now. */
  | { screen: 'postEdit'; postId: string; body: string };

/**
 * `split` (B-042, owner report: "split-pane opens unexpectedly on navigation") —
 * `undefined`/`true` keeps the ordinary "pair a `detail` screen with the nearest
 * `list` beneath it" rule (`routes.ts#wantsSplit`); `false` marks an entry pushed by a
 * plain `g <key>`/`:` jump so it never combines into a split the viewer never asked
 * for. Only the explicit "open beside" path (`Ctrl+G`) leaves it unset.
 */
export type NavEntry = NavEntryVariant & { split?: boolean };

export type NavStack = readonly [NavEntry, ...NavEntry[]];

/** The bottom of the stack: home when signed in, the local timeline otherwise. */
export function rootEntry(authenticated: boolean): NavEntry {
  const screen: RootScreen = authenticated ? 'home' : 'local';
  return { screen };
}

export function currentEntry(stack: NavStack): NavEntry {
  return stack[stack.length - 1] ?? stack[0];
}

export function currentScreen(stack: NavStack): Screen {
  return currentEntry(stack).screen;
}

/** True when `Esc`/`q` has somewhere to go back to. */
export function canGoBack(stack: NavStack): boolean {
  return stack.length > 1;
}

function sameEntry(a: NavEntry, b: NavEntry): boolean {
  if (a.screen !== b.screen) return false;
  if (a.screen === 'profile' && b.screen === 'profile') return a.actorId === b.actorId;
  if (a.screen === 'thread' && b.screen === 'thread') return a.postId === b.postId;
  if (a.screen === 'page' && b.screen === 'page') return a.handle === b.handle && a.slug === b.slug;
  if (a.screen === 'report' && b.screen === 'report') return a.target.id === b.target.id;
  if (a.screen === 'media' && b.screen === 'media') return a.postId === b.postId;
  if (a.screen === 'postEdit' && b.screen === 'postEdit') return a.postId === b.postId;
  if (a.screen === 'tagFeed' && b.screen === 'tagFeed') return a.tag.id === b.tag.id;
  return true;
}

/**
 * Drill-down: profile → thread → that reply's author → their page, each one a level
 * `Esc` pops. Re-entering the entry you are already on is a no-op rather than a
 * duplicate frame.
 */
export function push(stack: NavStack, entry: NavEntry): NavStack {
  if (sameEntry(currentEntry(stack), entry)) return stack;
  return [...stack, entry];
}

/**
 * A `g x`-style jump. Jumping to a root screen restarts the stack there (so `g h`
 * always lands you at the bottom, with nothing stale underneath); jumping to a screen
 * already somewhere on the stack unwinds to it instead of stacking a second copy —
 * otherwise `g b`, `g n`, `g b`, `g n` … would need four `Esc`s to escape.
 *
 * `options.split` (B-042) — omitted keeps today's list+detail pairing; `{ split:
 * false }` (the plain `g`/`:` path) marks the pushed entry so it never combines with a
 * list further down the stack into a split the viewer never asked for.
 */
export function jump(stack: NavStack, entry: NavEntry, options?: { split?: boolean }): NavStack {
  if (isRootScreen(entry.screen)) return [entry];
  const existing = stack.findIndex((candidate) => sameEntry(candidate, entry));
  if (existing >= 0) {
    const unwound = stack.slice(0, existing + 1);
    return unwound as unknown as NavStack;
  }
  const next: NavEntry = options?.split === false ? { ...entry, split: false } : entry;
  return [...stack, next];
}

/** `Esc` — exactly one level, never off the bottom. */
export function pop(stack: NavStack): NavStack {
  if (stack.length <= 1) return stack;
  return stack.slice(0, -1) as unknown as NavStack;
}

/** Replaces the whole stack, e.g. when a session appears/disappears. */
export function reset(entry: NavEntry): NavStack {
  return [entry];
}

/**
 * Swaps the current entry for another without deepening the stack — used when a
 * screen's *content* changes but its place in the history should not (posting a
 * reply replaces `compose` with the new post's thread, so `Esc` returns to the
 * timeline `r` was pressed from, not back into compose).
 */
export function replace(stack: NavStack, entry: NavEntry): NavStack {
  return [...stack.slice(0, -1), entry] as unknown as NavStack;
}
