import { contrastRatio } from '../color.js';
import {
  BUILT_IN_THEME_NAMES,
  type BuiltInThemeName,
  type GlyphSetName,
  type SemanticColorToken,
  type SemanticThemeColors,
  type ThemeDefinition,
} from './types.js';

export const READABLE_TEXT_CONTRAST = 4.5;

const SHELL_FOREGROUNDS = [
  'foreground',
  'muted',
  'accent',
  'ok',
  'warn',
  'error',
  'border',
  'link',
  'mention',
  'tag',
  'focus',
] as const satisfies readonly SemanticColorToken[];

export interface ThemeContrastCheck {
  readonly foreground: SemanticColorToken;
  readonly background: 'background' | 'selection';
  readonly ratio: number | null;
  readonly readable: boolean;
  readonly delegatedToTerminal: boolean;
}

export interface ThemeContrastValidation {
  readonly ok: boolean;
  readonly checks: readonly ThemeContrastCheck[];
  readonly failures: readonly ThemeContrastCheck[];
}

function defineTheme(
  name: BuiltInThemeName,
  colors: SemanticThemeColors,
  preferredGlyphSet: GlyphSetName,
  backgroundMode: ThemeDefinition['backgroundMode'] = 'paint',
): ThemeDefinition {
  return Object.freeze({
    name,
    colors: Object.freeze({ ...colors }),
    preferredGlyphSet,
    backgroundMode,
  });
}

const PATCHES = defineTheme(
  'patches',
  {
    background: '#160f24',
    foreground: '#f7f1ff',
    muted: '#b8a9c9',
    accent: '#d8a7ff',
    ok: '#7ee787',
    warn: '#ffd166',
    error: '#ff8a8a',
    border: '#b8a9c9',
    selection: '#55336f',
    link: '#80dfff',
    mention: '#f1b5ff',
    tag: '#9ce5ff',
    focus: '#fff59d',
    surfaceDim: '#0c0815',
  },
  'unicode',
);

const PAPER = defineTheme(
  'paper',
  {
    background: '#f7f2e8',
    foreground: '#26231f',
    muted: '#6b6257',
    accent: '#6a3dad',
    ok: '#28613c',
    warn: '#7a4b00',
    error: '#a1262d',
    border: '#6b6257',
    selection: '#d7cae9',
    link: '#005a8d',
    mention: '#753a8f',
    tag: '#355f23',
    focus: '#5e4600',
    surfaceDim: '#e4dcc8',
  },
  'unicode',
);

const MONO = defineTheme(
  'mono',
  {
    background: '#000000',
    foreground: '#ffffff',
    muted: '#b3b3b3',
    accent: '#ffffff',
    ok: '#ffffff',
    warn: '#ffffff',
    error: '#ffffff',
    border: '#b3b3b3',
    selection: '#4a4a4a',
    link: '#ffffff',
    mention: '#ffffff',
    tag: '#ffffff',
    focus: '#ffffff',
    surfaceDim: '#000000',
  },
  'ascii',
);

const HACKER = defineTheme(
  'hacker',
  {
    background: '#001400',
    foreground: '#d7ffd7',
    muted: '#8bcf8b',
    accent: '#00ff66',
    ok: '#00ff66',
    warn: '#ffe066',
    error: '#ff8080',
    border: '#00cc55',
    selection: '#125c2b',
    link: '#66e0ff',
    mention: '#a8ff60',
    tag: '#76ffb0',
    focus: '#fff27a',
    surfaceDim: '#000c00',
  },
  'ascii',
);

const PASTEL = defineTheme(
  'pastel',
  {
    background: '#24203a',
    foreground: '#fff8ff',
    muted: '#c4badb',
    accent: '#ffc2e2',
    ok: '#a8e6cf',
    warn: '#ffe29a',
    error: '#ff9aa2',
    border: '#b5a8d4',
    selection: '#5a4b78',
    link: '#9ad7ff',
    mention: '#e2c2ff',
    tag: '#b5ead7',
    focus: '#fff5ba',
    surfaceDim: '#191530',
  },
  'nerd',
);

const TERMINAL = defineTheme(
  'terminal',
  {
    background: null,
    foreground: null,
    muted: null,
    accent: null,
    ok: null,
    warn: null,
    error: null,
    border: null,
    selection: null,
    link: null,
    mention: null,
    tag: null,
    focus: null,
    surfaceDim: null,
  },
  'ascii',
  'terminal',
);

export const BUILT_IN_THEMES: Readonly<Record<BuiltInThemeName, ThemeDefinition>> = Object.freeze({
  patches: PATCHES,
  paper: PAPER,
  mono: MONO,
  hacker: HACKER,
  pastel: PASTEL,
  terminal: TERMINAL,
});

export function isBuiltInThemeName(name: string): name is BuiltInThemeName {
  return BUILT_IN_THEME_NAMES.some((candidate) => candidate === name);
}

export function getBuiltInTheme(name: string): ThemeDefinition | undefined {
  return isBuiltInThemeName(name) ? BUILT_IN_THEMES[name] : undefined;
}

export function listBuiltInThemes(): readonly ThemeDefinition[] {
  return BUILT_IN_THEME_NAMES.map((name) => BUILT_IN_THEMES[name]);
}

/** Validate every semantic foreground against its background using the shared WCAG helper. */
export function validateThemeContrast(theme: ThemeDefinition): ThemeContrastValidation {
  const pairs: readonly [SemanticColorToken, 'background' | 'selection'][] = [
    ...SHELL_FOREGROUNDS.map((foreground): [SemanticColorToken, 'background'] => [
      foreground,
      'background',
    ]),
    ['foreground', 'selection'],
  ];
  const checks = pairs.map(([foreground, background]) => {
    const foregroundColor = theme.colors[foreground];
    const backgroundColor = theme.colors[background];
    const delegatedToTerminal = foregroundColor === null && backgroundColor === null;
    const ratio =
      foregroundColor === null || backgroundColor === null
        ? null
        : contrastRatio(foregroundColor, backgroundColor);
    return Object.freeze({
      foreground,
      background,
      ratio,
      delegatedToTerminal,
      readable: delegatedToTerminal || (ratio !== null && ratio >= READABLE_TEXT_CONTRAST),
    });
  });
  const failures = checks.filter((check) => !check.readable);
  return Object.freeze({ ok: failures.length === 0, checks, failures });
}
