import type { Actor, Post } from '../api/wire/types.js';
import { describe, expect, it, vi } from 'vitest';

import type { PostRowActions } from '../components/PostList.js';
import {
  CommandHistory,
  completeCommand,
  contextualCommands,
  filterCommands,
  filterPaletteBindings,
  paletteBindings,
  parseCommand,
  tokenizeCommand,
} from './commands.js';
import { KEYMAP, validateKeymap, type Binding } from './keymap.js';
import {
  makeActor,
  makeMediaAttachment,
  makePost,
  makePostViewerState,
} from '../test/wire-fixtures.js';

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

function actor(id: string, handle: string): Actor {
  return makeActor({ id, handle });
}

function post(overrides: Partial<Post> = {}): Post {
  return makePost({ author: actor('actor-1', 'alice'), ...overrides });
}

describe('contextualCommands (P12-116)', () => {
  it('returns no commands when nothing is selected', () => {
    expect(contextualCommands({})).toEqual([]);
  });

  it('only offers a row verb when the caller wired its callback', () => {
    const onReply = vi.fn();
    const actions: PostRowActions = { onReply };
    const commands = contextualCommands({ post: post(), actions });
    expect(commands.map((command) => command.id)).toEqual(['reply']);
    commands[0]?.run();
    expect(onReply).toHaveBeenCalledWith(post());
  });

  it('labels like/bookmark/repost by the post’s own viewer state', () => {
    const actions: PostRowActions = {
      onToggleLike: vi.fn(),
      onToggleBookmark: vi.fn(),
      onToggleRepost: vi.fn(),
    };
    const liked = post({
      viewerState: makePostViewerState({ liked: true, bookmarked: true, reposted: true }),
    });
    const commands = contextualCommands({ post: liked, actions });
    const labels = Object.fromEntries(commands.map((command) => [command.id, command.label]));
    expect(labels['like']).toBe('Unlike');
    expect(labels['bookmark']).toBe('Remove bookmark');
    expect(labels['repost']).toBe('Undo repost');
  });

  it('offers Open attachment only when the post has media', () => {
    const actions: PostRowActions = { onOpenMedia: vi.fn() };
    expect(contextualCommands({ post: post(), actions })).toEqual([]);
    const withMedia = post({
      media: [
        makeMediaAttachment({
          mediaId: 'm1',
          altText: '',
          width: 0,
          height: 0,
          mimeType: 'image/png',
          position: 0,
        }),
      ],
    });
    const commands = contextualCommands({ post: withMedia, actions });
    expect(commands.map((command) => command.id)).toEqual(['open-media']);
  });

  it('gates Edit/Delete/Pin to the viewer’s own post', () => {
    const actions: PostRowActions = {
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onTogglePin: vi.fn(),
    };
    const mine = post({ author: actor('viewer-1', 'me') });
    expect(contextualCommands({ post: mine, actions, viewerActorId: 'someone-else' })).toEqual([]);
    const commands = contextualCommands({ post: mine, actions, viewerActorId: 'viewer-1' });
    expect(commands.map((command) => command.id).sort()).toEqual(['delete', 'edit', 'pin']);
  });

  it('parses @mentions, #tags and links out of the body into their own commands', () => {
    const onOpenActor = vi.fn();
    const onOpenTag = vi.fn();
    const onOpenLink = vi.fn();
    const withEntities = post({
      body: 'hey @bob check #patches at https://example.com/thread',
    });
    const commands = contextualCommands({
      post: withEntities,
      onOpenActor,
      onOpenTag,
      onOpenLink,
    });
    expect(commands.map(({ id, label, hint }) => ({ id, label, hint }))).toEqual([
      { id: 'mention:bob', label: 'Open @bob', hint: '' },
      { id: 'tag:patches', label: 'Open #patches', hint: '' },
      { id: 'link:https://example.com/thread', label: 'Open https://example.com/thread', hint: '' },
    ]);
    commands[0]?.run();
    expect(onOpenActor).toHaveBeenCalledWith('bob');
    commands[1]?.run();
    expect(onOpenTag).toHaveBeenCalledWith('patches');
    commands[2]?.run();
    expect(onOpenLink).toHaveBeenCalledWith('https://example.com/thread');
  });
});

describe('filterCommands', () => {
  it('fuzzy-filters by label the same way filterPaletteBindings filters by hint', () => {
    const commands = contextualCommands({
      post: post({ body: 'no entities here' }),
      actions: { onReply: vi.fn(), onToggleLike: vi.fn() },
    });
    expect(filterCommands('unlike', commands)).toEqual([]);
    expect(filterCommands('like', commands).map((command) => command.id)).toEqual(['like']);
  });
});
