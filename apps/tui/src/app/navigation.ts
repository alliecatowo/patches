import type { Actor } from '@patches/proto';

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
export type NavEntry =
  | { screen: Exclude<Screen, 'profile' | 'thread' | 'page' | 'report'> }
  | { screen: 'profile'; actorId: string; knownActor: Actor | undefined }
  | { screen: 'thread'; postId: string }
  | { screen: 'page'; handle: string; slug: string }
  | { screen: 'report'; target: ReportTarget };

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
 */
export function jump(stack: NavStack, entry: NavEntry): NavStack {
  if (isRootScreen(entry.screen)) return [entry];
  const existing = stack.findIndex((candidate) => sameEntry(candidate, entry));
  if (existing >= 0) {
    const unwound = stack.slice(0, existing + 1);
    return unwound as unknown as NavStack;
  }
  return [...stack, entry];
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
