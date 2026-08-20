import { describe, expect, it } from 'vitest';

import {
  canGoBack,
  currentScreen,
  jump,
  pop,
  push,
  replace,
  reset,
  rootEntry,
  type NavStack,
} from './navigation.js';

const local: NavStack = [{ screen: 'local' }];

describe('navigation stack (owner feedback 2026-08-18: "esc doesn\'t always go back")', () => {
  it('roots on home when signed in and local when signed out', () => {
    expect(rootEntry(true)).toEqual({ screen: 'home' });
    expect(rootEntry(false)).toEqual({ screen: 'local' });
  });

  it('pops exactly one level, never off the bottom', () => {
    const stack = push(push(local, { screen: 'thread', postId: 'a' }), { screen: 'accounts' });
    expect(currentScreen(stack)).toBe('accounts');
    expect(currentScreen(pop(stack))).toBe('thread');
    expect(currentScreen(pop(pop(stack)))).toBe('local');
    // At the root there is nothing left to pop.
    expect(pop(pop(pop(stack)))).toEqual(local);
    expect(canGoBack(local)).toBe(false);
  });

  it('nests drill-downs so each one is its own Esc', () => {
    const stack = push(
      push(push(local, { screen: 'profile', actorId: 'alice', knownActor: undefined }), {
        screen: 'thread',
        postId: 'p1',
      }),
      { screen: 'profile', actorId: 'bob', knownActor: undefined },
    );
    expect(stack).toHaveLength(4);
    const back = pop(stack);
    expect(currentScreen(back)).toBe('thread');
    // The profile underneath still points at Alice — the bug the payload-carrying
    // stack fixes (a single `profileTarget` would have been overwritten by Bob).
    const backAgain = pop(back);
    expect(backAgain[backAgain.length - 1]).toEqual({
      screen: 'profile',
      actorId: 'alice',
      knownActor: undefined,
    });
  });

  it('does not stack a duplicate of the entry already on top', () => {
    const stack = push(local, { screen: 'thread', postId: 'a' });
    expect(push(stack, { screen: 'thread', postId: 'a' })).toBe(stack);
    expect(push(stack, { screen: 'thread', postId: 'b' })).toHaveLength(3);
  });

  it('jumping to a root screen restarts the stack there', () => {
    const deep = push(push(local, { screen: 'thread', postId: 'a' }), { screen: 'accounts' });
    expect(jump(deep, { screen: 'home' })).toEqual([{ screen: 'home' }]);
  });

  it('jumping to a screen already on the stack unwinds to it instead of stacking a copy', () => {
    const stack = push(push(local, { screen: 'bookmarks' }), { screen: 'notifications' });
    const back = jump(stack, { screen: 'bookmarks' });
    expect(back).toHaveLength(2);
    expect(currentScreen(back)).toBe('bookmarks');
  });

  it('replace swaps the top without deepening the stack', () => {
    const stack = push(local, { screen: 'compose' });
    const swapped = replace(stack, { screen: 'thread', postId: 'new' });
    expect(swapped).toHaveLength(2);
    expect(currentScreen(swapped)).toBe('thread');
    expect(currentScreen(pop(swapped))).toBe('local');
  });

  it('reset throws the whole history away', () => {
    const stack = push(push(local, { screen: 'accounts' }), { screen: 'help' });
    expect(reset({ screen: 'local' })).toEqual(local);
    expect(canGoBack(stack)).toBe(true);
  });

  describe('B-042: a plain jump never auto-splits, and back stays symmetric', () => {
    it('marks a non-root jump `split: false` only when explicitly asked to', () => {
      const home: NavStack = [{ screen: 'home' }];
      const plain = jump(home, { screen: 'page', handle: 'alice', slug: '' }, { split: false });
      expect(currentScreen(plain)).toBe('page');
      expect(plain[plain.length - 1]).toMatchObject({ screen: 'page', split: false });

      // Omitting the option (the `Ctrl+G` "open beside" path) leaves it unset, the
      // same shape `jump()` always produced before this flag existed.
      const withSplit = jump(home, { screen: 'page', handle: 'alice', slug: '' });
      expect(withSplit[withSplit.length - 1]).not.toHaveProperty('split');
    });

    it('still pops back to exactly where you jumped from, split or not', () => {
      const home: NavStack = [{ screen: 'home' }];
      const plain = jump(home, { screen: 'page', handle: 'alice', slug: '' }, { split: false });
      expect(currentScreen(pop(plain))).toBe('home');
    });
  });
});
