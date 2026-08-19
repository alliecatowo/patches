export const BUILT_IN_THEME_NAMES = [
  'patches',
  'paper',
  'mono',
  'hacker',
  'pastel',
  'terminal',
] as const;

export type BuiltInThemeName = (typeof BUILT_IN_THEME_NAMES)[number];

export const SEMANTIC_COLOR_TOKENS = [
  'background',
  'foreground',
  'muted',
  'accent',
  'ok',
  'warn',
  'error',
  'border',
  'selection',
  'link',
  'mention',
  'tag',
  'focus',
  /** The dimmed backdrop under a modal/overlay (design vision §3.2 `surfaceDim`). Themes that
   * paint nothing (`terminal`, and `mono`'s zero-colour-code rendering) leave this `null` and the
   * overlay falls back to Ink's `dimColor`, never a literal fill. */
  'surfaceDim',
] as const;

export type SemanticColorToken = (typeof SEMANTIC_COLOR_TOKENS)[number];
export type GlyphSetName = 'unicode' | 'nerd' | 'ascii';

/** `null` delegates both foreground and background to the user's terminal palette. */
export type ThemeColor = string | null;

export type SemanticThemeColors = Readonly<Record<SemanticColorToken, ThemeColor>>;

interface ThemeShape<Name extends string> {
  readonly name: Name;
  readonly colors: SemanticThemeColors;
  readonly preferredGlyphSet: GlyphSetName;
  /** The terminal theme never paints a background, even inside a color-capable terminal. */
  readonly backgroundMode: 'paint' | 'terminal';
}

/** One of the six shipped themes. Kept narrow (`name: BuiltInThemeName`) because most of the
 * app — `app/App.tsx`'s theme state included — is typed against exactly these six names. */
export type ThemeDefinition = ThemeShape<BuiltInThemeName>;

/**
 * A built-in theme, or a user-chosen name for a JSON theme loaded from
 * `$XDG_CONFIG_HOME/patches/themes/<name>.json` (`theme/themes/load.ts`). A `ThemeDefinition`
 * is always a valid `AnyThemeDefinition` (structurally, `BuiltInThemeName` narrows `string`);
 * the reverse isn't true, which is exactly the point — code that must stay built-ins-only
 * (registry, `App.tsx`'s theme state) keeps using `ThemeDefinition`, and only the user-theme
 * loading path (`schema.ts`, `load.ts`, `resolveThemeWithUserThemes`, this file's own
 * provider in `theme/index.ts`) needs the wider type.
 */
export type AnyThemeDefinition = ThemeShape<string>;

/** Page and nameplate colors stay in their own render scope and never merge into shell colors. */
export interface ScopedDecorationColors {
  readonly wall: Readonly<
    Partial<Pick<SemanticThemeColors, 'background' | 'foreground' | 'accent' | 'border'>>
  >;
  readonly nameplate: Readonly<Partial<Pick<SemanticThemeColors, 'foreground' | 'border'>>>;
}

export interface ScopedThemeColors {
  readonly shell: SemanticThemeColors;
  readonly decoration: ScopedDecorationColors;
}

/**
 * Keep remote wall/nameplate colors structurally separate from client-owned shell semantics.
 * The returned objects are frozen so a renderer cannot accidentally mutate either scope.
 */
export function scopeDecorationColors(
  shell: SemanticThemeColors,
  decoration: {
    wall?: ScopedDecorationColors['wall'];
    nameplate?: ScopedDecorationColors['nameplate'];
  } = {},
): ScopedThemeColors {
  const scopedDecoration = Object.freeze({
    wall: Object.freeze({ ...(decoration.wall ?? {}) }),
    nameplate: Object.freeze({ ...(decoration.nameplate ?? {}) }),
  });
  return Object.freeze({ shell, decoration: scopedDecoration });
}
