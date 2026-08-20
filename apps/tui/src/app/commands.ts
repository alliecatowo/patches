import type { Post } from '../api/wire/types.js';

import type { PostRowActions } from '../components/PostList.js';
import { extractLinks, extractMentions, extractTags } from '../format/markup.js';
import { KEYMAP, type Binding, type CommandAlias, type Screen } from './keymap.js';

export interface CommandInvocation {
  alias: CommandAlias;
  args: readonly string[];
  binding: Binding;
  source: 'command';
}

export type CommandParseResult =
  { ok: true; invocation: CommandInvocation } | { ok: false; error: string };

type TokenizeResult = { ok: true; tokens: readonly string[] } | { ok: false; error: string };

/**
 * Tokenizes quotes and whitespace only. This deliberately is not a shell parser:
 * substitutions, redirects, pipes and process execution have no meaning here.
 */
export function tokenizeCommand(input: string): TokenizeResult {
  const tokens: string[] = [];
  let token = '';
  let quote: 'single' | 'double' | undefined;
  let escaped = false;

  for (const character of input.trim()) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== 'single') {
      escaped = true;
      continue;
    }
    if (character === "'" && quote !== 'double') {
      quote = quote === 'single' ? undefined : 'single';
      continue;
    }
    if (character === '"' && quote !== 'single') {
      quote = quote === 'double' ? undefined : 'double';
      continue;
    }
    if (/\s/u.test(character) && quote === undefined) {
      if (token !== '') {
        tokens.push(token);
        token = '';
      }
      continue;
    }
    token += character;
  }

  if (escaped) token += '\\';
  if (quote !== undefined) return { ok: false, error: 'Unclosed quote in command.' };
  if (token !== '') tokens.push(token);
  return { ok: true, tokens };
}

function commandAliases(bindings: readonly Binding[]): readonly {
  alias: CommandAlias;
  binding: Binding;
}[] {
  return bindings.flatMap((binding) =>
    (binding.commands ?? []).map((alias) => ({ alias, binding })),
  );
}

export function parseCommand(
  commandLine: string,
  bindings: readonly Binding[] = KEYMAP,
): CommandParseResult {
  const trimmed = commandLine.trim().replace(/^:/u, '').trim();
  if (trimmed.startsWith('!')) {
    return { ok: false, error: 'Shell commands are disabled; :! is not supported.' };
  }
  const tokenized = tokenizeCommand(trimmed);
  if (!tokenized.ok) return tokenized;
  const [rawName, ...args] = tokenized.tokens;
  if (rawName === undefined) return { ok: false, error: 'Enter a command.' };

  const found = commandAliases(bindings).find(
    ({ alias }) => alias.name.toLowerCase() === rawName.toLowerCase(),
  );
  if (found === undefined) return { ok: false, error: `Unknown command: :${rawName}` };

  const argument = found.alias.argument ?? 'none';
  if (argument === 'required' && args.length === 0) {
    return {
      ok: false,
      error: `Missing argument. Usage: :${found.alias.usage ?? `${found.alias.name} <value>`}`,
    };
  }
  if (argument === 'none' && args.length > 0) {
    return { ok: false, error: `:${found.alias.name} does not take arguments.` };
  }
  return {
    ok: true,
    invocation: { alias: found.alias, args, binding: found.binding, source: 'command' },
  };
}

function applies(binding: Binding, screen: Screen): boolean {
  return binding.on === 'global' || binding.on.includes(screen);
}

export function paletteBindings(
  screen: Screen,
  authenticated: boolean,
  bindings: readonly Binding[] = KEYMAP,
): readonly Binding[] {
  return bindings.filter(
    (binding) =>
      applies(binding, screen) &&
      (binding.session !== true || authenticated) &&
      (binding.helpOnly !== true || binding.group === 'Navigation'),
  );
}

function fuzzyScore(query: string, candidate: string): number | undefined {
  if (query === '') return 0;
  const haystack = candidate.toLowerCase();
  const needle = query.toLowerCase();
  const contiguous = haystack.indexOf(needle);
  if (contiguous >= 0) return contiguous;
  let cursor = 0;
  let score = 100;
  for (const character of needle) {
    const next = haystack.indexOf(character, cursor);
    if (next < 0) return undefined;
    score += next - cursor;
    cursor = next + 1;
  }
  return score;
}

export function filterPaletteBindings(
  query: string,
  bindings: readonly Binding[],
): readonly Binding[] {
  const normalized = query.trim().replace(/^:/u, '');
  const scored = bindings.flatMap((binding) => {
    const candidates = [
      ...(binding.commands ?? []).map((command) => ({ value: command.name, bias: -50 })),
      { value: binding.hint, bias: 0 },
      { value: binding.description ?? '', bias: 10 },
      { value: binding.keys, bias: 20 },
    ];
    const scores = candidates.flatMap(({ value, bias }) => {
      const score = fuzzyScore(normalized, value);
      return score === undefined ? [] : [score + bias];
    });
    const score = scores.length === 0 ? undefined : Math.min(...scores);
    return score === undefined ? [] : [{ binding, score }];
  });
  return scored
    .sort(
      (left, right) =>
        left.score - right.score || left.binding.hint.localeCompare(right.binding.hint),
    )
    .map(({ binding }) => binding);
}

// --- contextual commands (P12-116) --------------------------------------------

export interface Command {
  readonly id: string;
  readonly label: string;
  /** A keybinding-style hint shown beside the label (e.g. `'l'`); empty for a command
   * with no dedicated shortcut, such as one parsed out of the post body. */
  readonly hint: string;
  readonly run: () => void;
}

export interface ContextualSelection {
  /** The row under the cursor when the palette was opened over a list. `undefined`
   * (the palette's usual case — opened from a chrome-only screen) yields no commands. */
  post?: Post | undefined;
  /** The same action bag every timeline already spreads onto `PostList`/`VirtualList`
   * rows — reused here so a contextual command never needs its own copy of "how do I
   * like a post". A verb whose callback the caller hasn't wired is simply omitted,
   * the same way `PostList` itself only dispatches the keys it was given. */
  actions?: PostRowActions | undefined;
  /** Signed-in viewer's own actor id — gates Edit/Delete/Pin to the viewer's own posts. */
  viewerActorId?: string | undefined;
  /** `@handle` found in the body -> open that actor's profile. */
  onOpenActor?: ((handle: string) => void) | undefined;
  /** `#tag` found in the body -> open that tag's feed. */
  onOpenTag?: ((tag: string) => void) | undefined;
  /** A link href found in the body -> open it externally (same affordance as `o` on
   * an attachment). No in-DM/in-body link preview is ever rendered (spec §194) — this
   * is an explicit, viewer-initiated open, not an automatic fetch. */
  onOpenLink?: ((url: string) => void) | undefined;
}

function bind<T>(fn: ((arg: T) => void) | undefined, arg: T): (() => void) | undefined {
  return fn === undefined
    ? undefined
    : () => {
        fn(arg);
      };
}

/**
 * Row verbs (reply/like/bookmark/...) bound to the selected post, plus one command per
 * distinct `@mention`, `#tag` and link href parsed out of its body via `format/markup.ts`
 * — never a second parser (`.claude/rules/tui.md`). The command palette's contextual
 * half (P12-116): `CommandPalette` merges this list ahead of the static `KEYMAP`
 * bindings when it is opened with a selection.
 */
export function contextualCommands(selection: ContextualSelection): Command[] {
  const { post, actions, viewerActorId, onOpenActor, onOpenTag, onOpenLink } = selection;
  if (post === undefined) return [];
  const commands: Command[] = [];
  const push = (id: string, label: string, hint: string, run: (() => void) | undefined): void => {
    if (run === undefined) return;
    commands.push({ id, label, hint, run });
  };

  push('open-thread', 'Open thread', 'Enter', bind(actions?.onOpenPost, post));
  push('open-author', 'Open author profile', 'p', bind(actions?.onOpenAuthor, post));
  push('reply', 'Reply', 'r', bind(actions?.onReply, post));
  push(
    'like',
    post.viewerState?.liked === true ? 'Unlike' : 'Like',
    'l',
    bind(actions?.onToggleLike, post),
  );
  push(
    'bookmark',
    post.viewerState?.bookmarked === true ? 'Remove bookmark' : 'Bookmark',
    'b',
    bind(actions?.onToggleBookmark, post),
  );
  push(
    'repost',
    post.viewerState?.reposted === true ? 'Undo repost' : 'Repost',
    'R',
    bind(actions?.onToggleRepost, post),
  );
  push('quote', 'Quote post', 'Q', bind(actions?.onQuote, post));
  push('follow', 'Follow/unfollow author', 'f', bind(actions?.onToggleFollow, post));
  push('report', 'Report post', '!', bind(actions?.onReport, post));
  if (post.media.length > 0) {
    push('open-media', 'Open attachment', 'o', bind(actions?.onOpenMedia, post));
  }
  const isOwn = viewerActorId !== undefined && post.author?.id === viewerActorId;
  if (isOwn) {
    push('edit', 'Edit post', 'e', bind(actions?.onEdit, post));
    push('delete', 'Delete post', 'd', bind(actions?.onDelete, post));
    const pinned = post.author?.pinnedPostIds.includes(post.id) === true;
    push('pin', pinned ? 'Unpin post' : 'Pin post', 'I', bind(actions?.onTogglePin, post));
  }
  push('history', 'Edit history', 'H', bind(actions?.onHistory, post));

  for (const handle of extractMentions(post.body)) {
    push(`mention:${handle}`, `Open @${handle}`, '', bind(onOpenActor, handle));
  }
  for (const tag of extractTags(post.body)) {
    push(`tag:${tag}`, `Open #${tag}`, '', bind(onOpenTag, tag));
  }
  for (const href of extractLinks(post.body)) {
    push(`link:${href}`, `Open ${href}`, '', bind(onOpenLink, href));
  }

  return commands;
}

/** Fuzzy-filters `contextualCommands`' output the same way `filterPaletteBindings`
 * filters `KEYMAP` — one scoring function, so a query behaves identically whichever
 * half of the merged palette list it matches. */
export function filterCommands(query: string, commands: readonly Command[]): readonly Command[] {
  const normalized = query.trim().replace(/^:/u, '');
  const scored = commands.flatMap((command) => {
    const score = fuzzyScore(normalized, command.label);
    return score === undefined ? [] : [{ command, score }];
  });
  return scored
    .sort(
      (left, right) =>
        left.score - right.score || left.command.label.localeCompare(right.command.label),
    )
    .map(({ command }) => command);
}

export function completeCommand(query: string, bindings: readonly Binding[] = KEYMAP): string {
  const withoutColon = query.replace(/^:/u, '');
  if (/\s/u.test(withoutColon)) return query;
  const normalized = withoutColon.toLowerCase();
  const match = commandAliases(bindings)
    .map(({ alias }) => alias)
    .sort((left, right) => left.name.localeCompare(right.name))
    .find((alias) => alias.name.toLowerCase().startsWith(normalized));
  if (match === undefined) return query;
  return `${match.name}${match.argument === undefined || match.argument === 'none' ? '' : ' '}`;
}

/** Mutable process-session command history; UI state remains inside the palette. */
export class CommandHistory {
  readonly #entries: string[] = [];

  add(command: string): void {
    const normalized = command.trim().replace(/^:/u, '');
    if (normalized === '' || this.#entries.at(-1) === normalized) return;
    this.#entries.push(normalized);
  }

  entries(): readonly string[] {
    return this.#entries;
  }
}
