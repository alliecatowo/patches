import { describe, expect, it } from 'vitest';

import {
  CommandHistory,
  completeCommand,
  filterPaletteBindings,
  paletteBindings,
  parseCommand,
  tokenizeCommand,
} from './commands.js';
import { KEYMAP, validateKeymap, type Binding } from './keymap.js';

describe('Vim command parser', () => {
  it('resolves every required alias back to a KEYMAP binding', () => {
    for (const command of [
      'q',
      'quit',
      'q!',
      'w',
      'post',
      'wq',
      'home',
      'local',
      'profile',
      'search words',
      'messages',
      'communities',
      'tag typescript',
      'notifications',
      'bookmarks',
      'page',
      'theme mono',
      'plain toggle',
      'quiet on',
      'help',
      'back',
      'reload',
    ]) {
      const parsed = parseCommand(`:${command}`);
      expect(parsed.ok, command).toBe(true);
      if (parsed.ok) expect(KEYMAP).toContain(parsed.invocation.binding);
    }
  });

  it('handles leading whitespace, quotes, and escaped whitespace without shell expansion', () => {
    expect(tokenizeCommand(`  search "two words" 'three words' four\\ five  `)).toEqual({
      ok: true,
      tokens: ['search', 'two words', 'three words', 'four five'],
    });
    const parsed = parseCommand(` :search "two words" 'three words' `);
    expect(parsed).toMatchObject({
      ok: true,
      invocation: { args: ['two words', 'three words'] },
    });
  });

  it('reports unknown commands, missing arguments, extra arguments, and open quotes', () => {
    expect(parseCommand(':nope')).toEqual({ ok: false, error: 'Unknown command: :nope' });
    expect(parseCommand(':search')).toMatchObject({ ok: false });
    expect(parseCommand(':tag')).toMatchObject({ ok: false });
    // `:theme` takes an optional name now: bare `:theme` opens the preferences screen
    // with the live picker, which is a better answer than an error (P12-127).
    expect(parseCommand(':theme')).toMatchObject({ ok: true });
    expect(parseCommand(':home now')).toEqual({
      ok: false,
      error: ':home does not take arguments.',
    });
    expect(parseCommand(':search "unfinished')).toEqual({
      ok: false,
      error: 'Unclosed quote in command.',
    });
  });

  it('rejects :! and every attempted shell command explicitly', () => {
    for (const command of [':!', ':! ls', ':!echo owned', '  :! printf test']) {
      expect(parseCommand(command)).toEqual({
        ok: false,
        error: 'Shell commands are disabled; :! is not supported.',
      });
    }
  });

  it('completes aliases and retains de-duplicated process-session history', () => {
    expect(completeCommand('noti')).toBe('notifications');
    expect(completeCommand('sea')).toBe('search ');
    const history = new CommandHistory();
    history.add(':home');
    history.add('home');
    history.add(' search cats ');
    expect(history.entries()).toEqual(['home', 'search cats']);
  });
});

describe('KEYMAP validation and fuzzy palette source', () => {
  it('has no duplicate key in one screen+region and no duplicate command alias', () => {
    expect(validateKeymap(KEYMAP)).toEqual([]);
    const duplicate: readonly Binding[] = [
      { keys: 'x', hint: 'one', group: 'Screens', on: ['home'], region: 'list' },
      { keys: 'x', hint: 'two', group: 'Screens', on: ['home'], region: 'list' },
    ];
    expect(validateKeymap(duplicate)).toHaveLength(1);
  });

  it('filters contextual commands and routes from KEYMAP itself', () => {
    const available = paletteBindings('home', true);
    expect(filterPaletteBindings('rep', available)[0]?.keys).toBe('R');
    expect(
      filterPaletteBindings('local', available).some((binding) => binding.keys === 'g l'),
    ).toBe(true);
  });
});
