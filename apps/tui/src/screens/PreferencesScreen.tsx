import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { useKeyLayer, isPrintableInput } from '../app/input.js';
import { useContentSize } from '../app/layout.js';
import { ThemePreview, THEME_PREVIEW_DIMENSIONS } from '../components/ThemePreview.js';
import type { ImagePolicy } from '../preferences/store.js';
import { theme as shellTheme } from '../theme/index.js';
import { GLYPH_NAMES, glyph } from '../theme/glyphs.js';
import {
  BUILT_IN_THEMES,
  getBuiltInTheme,
  listBuiltInThemes,
  READABLE_TEXT_CONTRAST,
  validateThemeContrast,
} from '../theme/themes/registry.js';
import type { BuiltInThemeName, GlyphSetName, ThemeDefinition } from '../theme/themes/types.js';

export interface PreferencesScreenProps {
  isActive: boolean;
  /** The theme currently *previewed* — applied live, reverted by `Esc` (P12-112). */
  themeName: BuiltInThemeName;
  /** Where the session's theme came from: `--theme`, `PATCHES_THEME`, saved, default. */
  themeSource: string;
  onPreviewTheme: (name: BuiltInThemeName) => void;
  plain: boolean;
  onPlainChange: (next: boolean) => void;
  quiet: boolean;
  onQuietChange: (next: boolean) => void;
  /**
   * Glyph set (P12-103). Optional and uncontrolled when omitted — the row still works and
   * previews live, it just can't outlive this screen until the shell lifts the state up next
   * to `plain`/`quiet` the same way (see `theme/README.md`). `--theme`/`PATCHES_THEME`-style
   * precedence for this belongs to `resolveGlyphSet` (`theme/glyphs.ts`), not this screen.
   */
  glyphSet?: GlyphSetName;
  onGlyphSetChange?: (next: GlyphSetName) => void;
  /** Image policy (P12-113) — same optional/uncontrolled shape as `glyphSet` above. */
  imagePolicy?: ImagePolicy;
  onImagePolicyChange?: (next: ImagePolicy) => void;
  /** `Enter` — persist to this node+actor's local profile and close. */
  onSave: () => void;
  /** `Esc` — revert every change made on this screen and close. */
  onCancel: () => void;
  /** False while signed out: preferences are keyed by node origin + actor id. */
  canPersist: boolean;
  /** `Enter` on the "Privacy" row opens `:privacy` instead of saving (P14-015).
   * Optional so a caller that hasn't wired it yet still gets a working screen —
   * the row just does nothing on Enter until it is. */
  onOpenPrivacy?: () => void;
}

type Row = 'theme' | 'glyphs' | 'plain' | 'quiet' | 'images' | 'privacy';
const ROWS: readonly Row[] = ['theme', 'glyphs', 'plain', 'quiet', 'images', 'privacy'];
const GLYPH_SET_CYCLE: readonly GlyphSetName[] = ['unicode', 'nerd', 'ascii'];
const IMAGE_POLICY_CYCLE: readonly ImagePolicy[] = ['auto', 'pixel', 'ascii', 'box', 'off'];

const ROW_LABELS: Readonly<Record<Row, string>> = {
  theme: 'Theme',
  glyphs: 'Glyphs',
  plain: 'Plain mode',
  quiet: 'Quiet feed',
  images: 'Images',
  privacy: 'Privacy',
};

const ROW_HELP: Readonly<Record<Row, string>> = {
  theme: 'Applied live. Esc restores the theme you arrived with.',
  glyphs: 'unicode/nerd/ascii — never required: every control has a word alongside a glyph.',
  plain: 'Strips every colour, glyph and border — including your own (spec §173).',
  quiet: 'Hides other actors’ cosmetics; your own decoration stays (spec §185).',
  images: 'h/l cycles auto/pixel/ascii/box/off — see the line below for what each does.',
  privacy: 'Enter opens the privacy notice, discoverability, export and deletion (:privacy).',
};

/** One-line description of what each `images` row value actually draws — shown live
 * below the row list, in place of the generic `ROW_HELP.images` line, while `images`
 * is selected (P12-113/the terminal-art feature). */
const IMAGE_POLICY_HELP: Readonly<Record<ImagePolicy, string>> = {
  auto: 'Best available: real Kitty graphics, then pixel art, then ascii art.',
  pixel: 'Half-block colour art (truecolor or 256-colour) — even on a Kitty terminal.',
  ascii: 'Colourless dithered ascii art — no ANSI colour codes at all.',
  box: 'Always the dimensions box — the image is still fetched, just never drawn.',
  off: 'Off never fetches or draws an image — the alt-text box always still renders.',
};

/**
 * `,` — display preferences (P12-113/P12-127).
 *
 * The theme picker previews live rather than after a save, because a theme you cannot
 * see before committing to is not a choice. `Esc` restores the theme, plain and quiet
 * settings the viewer arrived with; `Enter` writes them to the per-node, per-actor
 * local profile (`preferences/store.ts`) — never to the server, and never anything
 * beyond presentation.
 */
export function PreferencesScreen({
  isActive,
  themeName,
  themeSource,
  onPreviewTheme,
  plain,
  onPlainChange,
  quiet,
  onQuietChange,
  glyphSet: controlledGlyphSet,
  onGlyphSetChange,
  imagePolicy: controlledImagePolicy,
  onImagePolicyChange,
  onSave,
  onCancel,
  canPersist,
  onOpenPrivacy,
}: PreferencesScreenProps): ReactElement {
  const content = useContentSize();
  const [row, setRow] = useState(0);
  // Uncontrolled fallback: a signed-in shell that hasn't yet lifted glyph/image state up to
  // `App.tsx` (see `theme/README.md`) still gets a working, live-previewing row here — it
  // just can't outlive this screen instance until that wiring lands.
  const [localGlyphSet, setLocalGlyphSet] = useState<GlyphSetName>('unicode');
  const [localImagePolicy, setLocalImagePolicy] = useState<ImagePolicy>('auto');
  const glyphSetValue = controlledGlyphSet ?? localGlyphSet;
  const imagePolicyValue = controlledImagePolicy ?? localImagePolicy;
  const setGlyphSet = onGlyphSetChange ?? setLocalGlyphSet;
  const setImagePolicy = onImagePolicyChange ?? setLocalImagePolicy;

  const themes = listBuiltInThemes();
  const themeIndex = Math.max(
    0,
    themes.findIndex((candidate) => candidate.name === themeName),
  );
  const current = ROWS[Math.min(row, ROWS.length - 1)] ?? 'theme';

  function step(direction: 1 | -1): void {
    if (current === 'theme') {
      const next = themes[(themeIndex + direction + themes.length) % themes.length];
      if (next !== undefined) onPreviewTheme(next.name);
      return;
    }
    if (current === 'glyphs') {
      const index = GLYPH_SET_CYCLE.indexOf(glyphSetValue);
      const nextIndex = (index + direction + GLYPH_SET_CYCLE.length) % GLYPH_SET_CYCLE.length;
      const next = GLYPH_SET_CYCLE[nextIndex];
      if (next !== undefined) setGlyphSet(next);
      return;
    }
    if (current === 'plain') {
      onPlainChange(!plain);
      return;
    }
    if (current === 'quiet') {
      onQuietChange(!quiet);
      return;
    }
    if (current === 'privacy') return;
    const index = IMAGE_POLICY_CYCLE.indexOf(imagePolicyValue);
    const nextIndex = (index + direction + IMAGE_POLICY_CYCLE.length) % IMAGE_POLICY_CYCLE.length;
    const next = IMAGE_POLICY_CYCLE[nextIndex];
    if (next !== undefined) setImagePolicy(next);
  }

  useKeyLayer(
    {
      id: 'preferences',
      onKey(input, key) {
        if (key.ctrl || key.meta) return false;
        if (key.escape) {
          onCancel();
          return true;
        }
        if (key.return) {
          if (current === 'privacy' && onOpenPrivacy !== undefined) onOpenPrivacy();
          else onSave();
          return true;
        }
        if (input === 'j' || key.downArrow) {
          setRow((value) => Math.min(ROWS.length - 1, value + 1));
          return true;
        }
        if (input === 'k' || key.upArrow) {
          setRow((value) => Math.max(0, value - 1));
          return true;
        }
        if (input === 'l' || key.rightArrow || input === ' ') {
          step(1);
          return true;
        }
        if (input === 'h' || key.leftArrow) {
          step(-1);
          return true;
        }
        // Swallow every other printable key so `q`/`c` don't act on the shell while
        // the viewer is inside a settings screen.
        return isPrintableInput(input, key);
      },
    },
    isActive,
  );

  const previewTheme: ThemeDefinition = getBuiltInTheme(themeName) ?? BUILT_IN_THEMES.patches;
  const glyphPreview = GLYPH_NAMES.map((name) => glyph(name, glyphSetValue)).join(' ');
  // Live contrast explanation for the theme currently previewed (P12-112) — the
  // same WCAG floor `ColorPicker` enforces per-swatch, surfaced here per-theme so
  // switching themes tells you *why* a theme is (or isn't) readable, not just that
  // it applied.
  const themeContrast = validateThemeContrast(previewTheme).checks.find(
    (check) => check.foreground === 'foreground' && check.background === 'background',
  );
  const themeContrastLine =
    themeContrast === undefined || themeContrast.ratio === null
      ? "Delegates foreground and background to your terminal's colours — no contrast to check."
      : `AA contrast ${themeContrast.ratio.toFixed(2)}:1 against background${
          themeContrast.readable ? '' : ` — below the ${READABLE_TEXT_CONTRAST.toFixed(2)}:1 floor`
        }.`;
  // Title, source line, six option rows, help line, hint line.
  const chromeRows = 10;
  const showPreview = content.rows >= chromeRows + THEME_PREVIEW_DIMENSIONS.height;

  function rowValue(candidate: Row): string {
    switch (candidate) {
      case 'theme':
        return `${themeName} (${String(themeIndex + 1)}/${String(themes.length)})`;
      case 'glyphs':
        return `${glyphSetValue}  ${glyphPreview}`;
      case 'plain':
        return plain ? 'on' : 'off';
      case 'quiet':
        return quiet ? 'on' : 'off';
      case 'images':
        return imagePolicyValue;
      case 'privacy':
        return 'Enter to open →';
    }
  }

  return (
    <Box flexDirection="column" height={content.rows} flexShrink={0} overflow="hidden">
      <Text color={shellTheme.accent} wrap="truncate-end">
        Preferences
      </Text>
      <Text color={shellTheme.muted} wrap="truncate-end">
        theme source: {themeSource}
        {canPersist ? '' : ' · sign in to save these'}
      </Text>
      {ROWS.map((candidate, index) => (
        <Text key={candidate} wrap="truncate-end" inverse={index === row}>
          {index === row ? '>' : ' '} {ROW_LABELS[candidate]}: {rowValue(candidate)}
        </Text>
      ))}
      <Text color={shellTheme.muted} wrap="truncate-end">
        {current === 'images'
          ? IMAGE_POLICY_HELP[imagePolicyValue]
          : current === 'theme'
            ? themeContrastLine
            : ROW_HELP[current]}
      </Text>
      {showPreview ? (
        <Box
          width={Math.min(THEME_PREVIEW_DIMENSIONS.width, content.columns)}
          height={THEME_PREVIEW_DIMENSIONS.height}
          flexShrink={0}
          overflow="hidden"
        >
          <ThemePreview theme={previewTheme} plain={plain} />
        </Box>
      ) : null}
      <Text color={shellTheme.muted} wrap="truncate-end">
        j/k row · h/l change · Enter save · Esc cancel
      </Text>
    </Box>
  );
}
