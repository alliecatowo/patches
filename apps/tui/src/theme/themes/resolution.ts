import { BUILT_IN_THEMES, getBuiltInTheme } from './registry.js';
import { loadUserTheme, type LoadUserThemeResult } from './load.js';
import { BUILT_IN_THEME_NAMES, type AnyThemeDefinition, type ThemeDefinition } from './types.js';

export type ThemeResolutionSource = 'cli' | 'env' | 'local' | 'actor' | 'default';

export interface ResolveThemeInput {
  readonly cliTheme?: string | null;
  readonly envTheme?: string | null;
  readonly localTheme?: string | null;
  readonly actorTheme?: string | null;
}

export type ThemeResolution =
  | {
      readonly ok: true;
      readonly theme: ThemeDefinition;
      readonly source: ThemeResolutionSource;
    }
  | {
      readonly ok: false;
      readonly invalidName: string;
      readonly source: Exclude<ThemeResolutionSource, 'default'>;
      readonly message: string;
      readonly availableThemes: readonly string[];
    };

interface Candidate {
  readonly name: string;
  readonly source: Exclude<ThemeResolutionSource, 'default'>;
  readonly setting: string;
}

function candidate(
  value: string | null | undefined,
  source: Candidate['source'],
  setting: string,
): Candidate | undefined {
  const name = value?.trim();
  return name === undefined || name === '' ? undefined : { name, source, setting };
}

/**
 * Pure precedence resolution: --theme > PATCHES_THEME > local account > actor profile > patches.
 * An invalid higher-priority value is returned as an actionable error instead of being bypassed.
 */
export function resolveTheme(input: ResolveThemeInput): ThemeResolution {
  const selected =
    candidate(input.cliTheme, 'cli', '--theme') ??
    candidate(input.envTheme, 'env', 'PATCHES_THEME') ??
    candidate(input.localTheme, 'local', 'local preference') ??
    candidate(input.actorTheme, 'actor', 'actor profile');

  if (selected === undefined) {
    return { ok: true, theme: BUILT_IN_THEMES.patches, source: 'default' };
  }

  const theme = getBuiltInTheme(selected.name);
  if (theme !== undefined) return { ok: true, theme, source: selected.source };

  const availableThemes = [...BUILT_IN_THEME_NAMES];
  return {
    ok: false,
    invalidName: selected.name,
    source: selected.source,
    availableThemes,
    message: `Unknown theme "${selected.name}" from ${selected.setting}. Choose one of: ${availableThemes.join(', ')}.`,
  };
}

export type ThemeResolutionAny =
  | {
      readonly ok: true;
      readonly theme: AnyThemeDefinition;
      readonly source: ThemeResolutionSource;
    }
  | Extract<ThemeResolution, { ok: false }>;

export interface ThemeResolutionWithUserThemes {
  readonly resolution: ThemeResolutionAny;
  /** Set only when a user JSON theme was found but failed validation — the caller (shell
   * startup, `PreferencesScreen`) shows this as a toast even though `resolution` itself
   * still succeeded by falling back to `patches` (P12-101: "invalid user JSON → toast,
   * default applied"). */
  readonly invalidUserThemeMessage?: string;
}

/**
 * Same precedence as {@link resolveTheme}, extended so a name that isn't a built-in is tried
 * against `$XDG_CONFIG_HOME/patches/themes/<name>.json` before being treated as an error. Pure
 * `resolveTheme` stays synchronous and built-ins-only (existing callers/tests are unaffected);
 * this wrapper is the one to use once disk access is available (i.e. not at pure-function
 * call sites).
 */
export async function resolveThemeWithUserThemes(
  input: ResolveThemeInput,
  loader: (name: string) => Promise<LoadUserThemeResult> = loadUserTheme,
): Promise<ThemeResolutionWithUserThemes> {
  const builtInResult = resolveTheme(input);
  if (builtInResult.ok) return { resolution: builtInResult };

  const loaded = await loader(builtInResult.invalidName);
  if (loaded.ok) {
    return { resolution: { ok: true, theme: loaded.theme, source: builtInResult.source } };
  }

  // A name nobody has heard of (no built-in, no file on disk) is the plain "unknown theme"
  // error already computed. A name that *is* a file but fails validation instead falls back
  // to the default theme with an explanatory toast, never a crash or a silently-broken UI.
  if (!('message' in loaded)) {
    return { resolution: builtInResult };
  }
  return {
    resolution: { ok: true, theme: BUILT_IN_THEMES.patches, source: 'default' },
    invalidUserThemeMessage: loaded.message,
  };
}
