import { describe, expect, it } from 'vitest';

import { SCREEN_TITLES, type Screen } from './keymap.js';
import type { NavStack } from './navigation.js';
import {
  ROUTE_KINDS,
  nearestListBeneath,
  presentationFor,
  routeKind,
  wantsSplit,
} from './routes.js';

describe('route kinds', () => {
  it('classifies every screen the shell can show', () => {
    for (const screen of Object.keys(SCREEN_TITLES) as Screen[]) {
      expect(ROUTE_KINDS[screen], `${screen} has no route kind`).toBeDefined();
    }
    expect(Object.keys(ROUTE_KINDS).sort()).toEqual(Object.keys(SCREEN_TITLES).sort());
  });

  it('puts timelines on the left, opened things on the right, and tasks full width', () => {
    expect(routeKind('home')).toBe('list');
    expect(routeKind('thread')).toBe('detail');
    expect(routeKind('media')).toBe('detail');
    expect(routeKind('compose')).toBe('full');
    expect(routeKind('preferences')).toBe('full');
  });
});

describe('split presentation', () => {
  const homeThread: NavStack = [{ screen: 'home' }, { screen: 'thread', postId: 'p1' }];

  it('wants a split only for a detail opened from a list', () => {
    expect(wantsSplit([{ screen: 'home' }])).toBe(false);
    expect(wantsSplit(homeThread)).toBe(true);
    expect(wantsSplit([{ screen: 'home' }, { screen: 'compose' }])).toBe(false);
    expect(wantsSplit([{ screen: 'thread', postId: 'p1' }])).toBe(false);
  });

  it('finds the nearest list beneath the top, skipping intervening details', () => {
    const deep: NavStack = [
      { screen: 'local' },
      { screen: 'thread', postId: 'a' },
      { screen: 'media', postId: 'a', attachments: [], initialIndex: 0 },
    ];
    expect(nearestListBeneath(deep)).toEqual({ screen: 'local' });
    expect(wantsSplit(deep)).toBe(true);
  });

  it('renders one pane when the layout did not grant a split', () => {
    expect(presentationFor(homeThread, false)).toEqual({
      mode: 'single',
      primary: { screen: 'thread', postId: 'p1' },
    });
  });

  it('renders the list beside the detail when it did', () => {
    expect(presentationFor(homeThread, true)).toEqual({
      mode: 'split',
      primary: { screen: 'home' },
      secondary: { screen: 'thread', postId: 'p1' },
    });
  });

  it('never splits a full-width task screen, however wide the terminal is', () => {
    const composing: NavStack = [{ screen: 'home' }, { screen: 'compose' }];
    expect(presentationFor(composing, true)).toEqual({
      mode: 'single',
      primary: { screen: 'compose' },
    });
  });

  it('B-042: a plain `g <key>` jump never auto-splits, even with a list beneath it', () => {
    // Same shape `jump(..., { split: false })` produces for the own-page jump ('g v')
    // — the owner's exact repro: a list beneath a plain-jumped-to detail screen.
    const plainJump: NavStack = [
      { screen: 'home' },
      { screen: 'page', handle: 'alice', slug: '', split: false },
    ];
    // `wantsSplit` is the sole authority App.tsx consults before ever asking
    // `presentationFor` to grant a split (`wantsSplit(stack) && !linearMode`), so this
    // is what actually keeps a plain jump single-pane in the running app.
    expect(wantsSplit(plainJump)).toBe(false);

    // The explicit `Ctrl+G` "open beside" request omits the flag — the ordinary
    // list+detail pairing still applies.
    const requestedSplit: NavStack = [
      { screen: 'home' },
      { screen: 'page', handle: 'alice', slug: '' },
    ];
    expect(wantsSplit(requestedSplit)).toBe(true);
  });

  it('is a pure function of the stack: presentation changes, history does not', () => {
    const wide = presentationFor(homeThread, true);
    const narrow = presentationFor(homeThread, false);
    expect(wide.mode).not.toBe(narrow.mode);
    // Whatever the presentation, the top of the stack is unchanged and `Esc` still
    // pops exactly one level — the acceptance criterion for P12-021.
    expect(homeThread).toHaveLength(2);
    expect(homeThread[homeThread.length - 1]).toEqual({ screen: 'thread', postId: 'p1' });
  });
});
