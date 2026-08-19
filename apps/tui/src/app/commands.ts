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
