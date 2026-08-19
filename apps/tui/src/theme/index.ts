import { useSyncExternalStore } from 'react';

import { BUILT_IN_THEMES } from './themes/registry.js';
import { resolveTheme } from './themes/resolution.js';
import type { AnyThemeDefinition, SemanticColorToken } from './themes/types.js';

export type { AnyThemeDefinition, SemanticColorToken, ThemeDefinition } from './themes/types.js';

/**
 * Pre-engine ANSI defaults (the file's whole palette before P12-101). Used only as the
 * fallback for the six legacy flat getters below, when the active theme delegates a token to
 * the terminal (`null`) — every call site that was already typed `string` (not `string |
 * undefined`) before this file grew a real engine keeps compiling without a change on its end.
 */
const LEGACY_FALLBACK: Readonly<Record<SemanticColorToken, string>> = {
  background: 'black',
  foreground: 'white',
  muted: 'gray',
  accent: 'magenta',
  ok: 'green',
  warn: 'yellow',
  error: 'red',
  border: 'gray',
  selection: 'gray',
  link: 'cyan',
  mention: 'blue',
  tag: 'green',
  focus: 'magenta',
  surfaceDim: 'gray',
};

/**
 * Minimal, self-contained `--theme <name>` / `--theme=<name>` scan, deliberately duplicating
 * `cli/args.ts`'s tiny grammar for just this one flag rather than importing it — `theme/`
 * resolves at module-load time, before `apps/tui/src/cli.tsx` has parsed anything, and a
 * `theme -> cli` import would be the wrong direction for a package that must stay leaf-level.
 */
function cliThemeFlag(argv: readonly string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--theme') return argv[index + 1];
    if (argument?.startsWith('--theme=') === true) return argument.slice('--theme='.length);
  }
  return undefined;
}

function resolveInitialTheme(): AnyThemeDefinition {
  const result = resolveTheme({
    cliTheme: cliThemeFlag(process.argv.slice(2)) ?? null,
    envTheme: process.env.PATCHES_THEME ?? null,
  });
  // An invalid CLI/env name falls back to the default here rather than erroring at import
  // time (there is no UI yet to show the message to) — `resolveThemeWithUserThemes` is the
  // version app startup should call explicitly so it can toast this instead (P12-101).
  return result.ok ? result.theme : BUILT_IN_THEMES.patches;
}

let activeTheme: AnyThemeDefinition = resolveInitialTheme();
const listeners = new Set<() => void>();

export function getActiveThemeDefinition(): AnyThemeDefinition {
  return activeTheme;
}

/**
 * Applies a resolved theme app-wide. Intended callers: app startup once
 * `resolveThemeWithUserThemes` (env/CLI/profile/user-JSON) has run, and `PreferencesScreen`'s
 * live picker. Every subscriber via {@link useThemeDefinition} re-renders; every already-shipped
 * component reading `theme.x` inline picks the new value up on its next render, same as any
 * other external mutable read. Accepts a built-in `ThemeDefinition` or a loaded user
 * `AnyThemeDefinition` — a built-in is always a valid `AnyThemeDefinition`.
 */
export function setActiveTheme(definition: AnyThemeDefinition): void {
  if (definition === activeTheme) return;
  activeTheme = definition;
  for (const listener of listeners) listener();
}

export function subscribeToThemeChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Reactive hook for a component that must re-render the instant `setActiveTheme` runs (the
 * live theme-picker preview, `PreferencesScreen`). Components that merely read `theme.x` or
 * call {@link tone} during their own render already pick up a change next time anything causes
 * them to re-render — this hook is for the one that has to be that "anything".
 */
export function useThemeDefinition(): AnyThemeDefinition {
  return useSyncExternalStore(
    subscribeToThemeChanges,
    getActiveThemeDefinition,
    getActiveThemeDefinition,
  );
}

/**
 * The literal colour a semantic token resolves to under the active theme, or `undefined` when
 * the theme delegates that token to the terminal (`null`, e.g. `terminal`) or the active theme
 * is `mono` — design vision §4.1 ("no colour: bold/dim/inverse only"); P12-101 requires mono to
 * render *zero* colour codes, which a concrete fallback string would defeat. Prefer this over
 * the legacy flat getters below in new code (this file's own `Toast`/`Loading`/`Banner`/
 * `ProgressBar` do).
 */
export function tone(token: SemanticColorToken): string | undefined {
  if (activeTheme.name === 'mono') return undefined;
  const value = activeTheme.colors[token];
  return value === null ? undefined : value;
}

function legacy(token: SemanticColorToken): string {
  return tone(token) ?? LEGACY_FALLBACK[token];
}

/**
 * The one place colours are named — now a live view over the active `ThemeDefinition`
 * (`theme/themes/*`, precedence resolved by `theme/themes/resolution.ts`) instead of a fixed
 * palette. Every property is a getter, so `theme.x` always reflects whatever `setActiveTheme`
 * last applied, and every pre-existing call site (`theme.accent`, `theme.muted`, …) keeps
 * compiling and working unchanged (P12-101's "every existing `theme.x` call resolves through
 * the provider").
 *
 * These stay typed as plain `string` (never `undefined`) for compatibility with call sites
 * that were already typed that way — e.g. `function statusColor(status): string` in
 * `app/App.tsx` — before this file grew an engine; they fall back to the pre-engine ANSI name
 * when the active theme delegates a token to the terminal. `border`/`focus` (aliased here as
 * `borderFocus`, P12-025) and the rest of the 13 semantic tokens are included for new call
 * sites; `tone()` is the one that actually goes colourless under `mono`/`terminal`.
 */
export const theme = {
  get accent(): string {
    return legacy('accent');
  },
  get muted(): string {
    return legacy('muted');
  },
  get ok(): string {
    return legacy('ok');
  },
  get warn(): string {
    return legacy('warn');
  },
  get error(): string {
    return legacy('error');
  },
  get text(): string {
    return legacy('foreground');
  },
  get background(): string {
    return legacy('background');
  },
  get border(): string {
    return legacy('border');
  },
  get borderFocus(): string {
    return legacy('focus');
  },
  get link(): string {
    return legacy('link');
  },
  get mention(): string {
    return legacy('mention');
  },
  get tag(): string {
    return legacy('tag');
  },
  get selection(): string {
    return legacy('selection');
  },
};

/** Minimum usable terminal, below which the layout is not drawn at all (spec §72). */
export const MIN_TERMINAL_SIZE = { columns: 60, rows: 20 } as const;
