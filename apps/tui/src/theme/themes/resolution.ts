import { BUILT_IN_THEMES, getBuiltInTheme } from './registry.js';
import { BUILT_IN_THEME_NAMES, type ThemeDefinition } from './types.js';

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
