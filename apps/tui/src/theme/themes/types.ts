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
] as const;

export type SemanticColorToken = (typeof SEMANTIC_COLOR_TOKENS)[number];
export type GlyphSetName = 'unicode' | 'nerd' | 'ascii';

/** `null` delegates both foreground and background to the user's terminal palette. */
export type ThemeColor = string | null;

export type SemanticThemeColors = Readonly<Record<SemanticColorToken, ThemeColor>>;

export interface ThemeDefinition {
  readonly name: BuiltInThemeName;
  readonly colors: SemanticThemeColors;
  readonly preferredGlyphSet: GlyphSetName;
  /** The terminal theme never paints a background, even inside a color-capable terminal. */
  readonly backgroundMode: 'paint' | 'terminal';
}

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
