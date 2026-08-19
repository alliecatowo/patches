import { describe, expect, it } from 'vitest';

import { hintsFor, KEYMAP } from '../src/app/keymap.js';
import { expectFrame, flush, KEY, renderApp } from './harness.js';

describe('help screen (spec §69: keybindings must stay discoverable)', () => {
  it('toggles into the grouped keymap with ? and back out again', async () => {
    const { press, lastFrame, unmount } = renderApp();
    await expectFrame(lastFrame, 'Local');
    await flush();

    press('?');
    const frame = await expectFrame(lastFrame, 'Navigation');
    // Contextual: the screen `?` was pressed from is listed first.
    expect(frame).toContain('Here — Local');

    await flush();
    press('?');
    await expectFrame(lastFrame, 'Reading as a guest');
    unmount();
  });

  it('closes with Esc as well as ?', async () => {
    const { press, lastFrame, unmount } = renderApp();
    await expectFrame(lastFrame, 'Local');
    await flush();

    press('?');
    await expectFrame(lastFrame, 'Navigation');

    await flush();
    press(KEY.escape);
    await expectFrame(lastFrame, 'Reading as a guest');
    unmount();
  });
});

describe('status hints and help come from one keymap table', () => {
  it('every status-bar hint is a real binding in KEYMAP', () => {
    for (const screen of ['home', 'local', 'thread', 'profile', 'page', 'compose'] as const) {
      for (const hint of hintsFor(screen, { authenticated: true, canGoBack: true })) {
        if (hint === 'Esc back' || hint === 'q quit') continue;
        const matched = KEYMAP.some((binding) => `${binding.keys} ${binding.hint}` === hint);
        expect(matched, `${screen}: ${hint}`).toBe(true);
      }
    }
  });

  it('always offers the keys that work everywhere, back last', () => {
    const hints = hintsFor('local', { authenticated: true, canGoBack: true });
    expect(hints).toContain('c compose');
    expect(hints).toContain('/ search');
    expect(hints).toContain('? help');
    expect(hints.at(-1)).toBe('Esc back');
  });

  it('offers q quit instead of Esc back at the root of the stack', () => {
    const hints = hintsFor('local', { authenticated: false, canGoBack: false });
    expect(hints.at(-1)).toBe('q quit');
  });

  it('hides session-only keys while signed out', () => {
    const hints = hintsFor('local', { authenticated: false, canGoBack: false });
    expect(hints).not.toContain('c compose');
    expect(hints).not.toContain('g h home');
  });

  it('puts the screen’s own keys before the global tail', () => {
    const hints = hintsFor('thread', { authenticated: true, canGoBack: true });
    expect(hints.indexOf('Enter thread')).toBeLessThan(hints.indexOf('c compose'));
  });

  it('gives a text-entry screen only its own keys — the global keymap is standing aside', () => {
    const hints = hintsFor('compose', { authenticated: true, canGoBack: true });
    expect(hints).toEqual(['Ctrl+S post', 'Ctrl+A attach', 'Esc keep draft']);
  });
});
