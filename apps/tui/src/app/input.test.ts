import type { Key } from 'ink';
import { describe, expect, it, vi } from 'vitest';

import {
  createKeyLayerStack,
  isCoalescedKeyRun,
  isPaletteShortcut,
  legacyInputConsumes,
  type KeyLayer,
} from './input.js';

function key(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
    ...overrides,
  };
}

describe('key-layer stack', () => {
  it('dispatches top-down and stops at the first consumed layer', () => {
    const stack = createKeyLayerStack();
    const bottom = vi.fn(() => true);
    const top = vi.fn(() => true);
    const bottomLayer: KeyLayer = { id: 'bottom', onKey: bottom };
    const topLayer: KeyLayer = { id: 'top', onKey: top };
    stack.register(() => bottomLayer);
    const unregisterTop = stack.register(() => topLayer);

    expect(stack.dispatch('x', key())).toBe(true);
    expect(top).toHaveBeenCalledOnce();
    expect(bottom).not.toHaveBeenCalled();

    unregisterTop();
    expect(stack.dispatch('x', key())).toBe(true);
    expect(bottom).toHaveBeenCalledOnce();
  });

  it('lets safety and palette chords escape a legacy text/sub-mode layer', () => {
    expect(legacyInputConsumes('q', key(), true)).toBe(true);
    expect(legacyInputConsumes(':', key(), true)).toBe(true);
    expect(legacyInputConsumes('', key({ escape: true }), true)).toBe(true);
    expect(legacyInputConsumes('c', key({ ctrl: true }), true)).toBe(false);
    expect(legacyInputConsumes('p', key({ ctrl: true }), true)).toBe(false);
    expect(isPaletteShortcut('p', key({ ctrl: true }))).toBe(true);
  });
});

describe('isCoalescedKeyRun (B-042: a fast-typed `g h` arriving as one stdin chunk)', () => {
  it('is true only for several ordinary characters landing in one keypress', () => {
    expect(isCoalescedKeyRun('gh', key())).toBe(true);
    expect(isCoalescedKeyRun('g', key())).toBe(false);
    expect(isCoalescedKeyRun('', key())).toBe(false);
  });

  it('never fires for a control key, even one whose `input` happens to be multi-char', () => {
    expect(isCoalescedKeyRun('AB', key({ ctrl: true }))).toBe(false);
    expect(isCoalescedKeyRun('gh', key({ escape: true }))).toBe(false);
    expect(isCoalescedKeyRun('gh', key({ upArrow: true }))).toBe(false);
  });

  it('counts by code point, so a multi-byte emoji stays one key', () => {
    expect(isCoalescedKeyRun('😀', key())).toBe(false);
    expect(isCoalescedKeyRun('😀g', key())).toBe(true);
  });
});
