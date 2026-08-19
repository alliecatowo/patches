# `theme/` — mounting notes

This package builds the P12-101/103/117 pieces of the theme engine: built-in themes, JSON user
themes, `--theme`/`PATCHES_THEME`/profile precedence, glyph sets, and the flat `theme.x` colour
provider every existing component already imports. It does not itself wire the shell up to it
(that's P12-127) — this file is the "how" for whoever does.

## What already works with zero wiring

- `theme.accent`, `theme.muted`, `theme.ok`, `theme.warn`, `theme.error`, `theme.text`,
  `theme.background`, `theme.border`, `theme.borderFocus`, `theme.link`, `theme.mention`,
  `theme.tag`, `theme.selection` (`theme/index.ts`) already resolve dynamically from the active
  theme, and the active theme is already initialized from `--theme`/`--theme=<name>` (scanned
  from `process.argv` directly — see `cliThemeFlag`) and `PATCHES_THEME`, at module load. Every
  existing `import { theme } from '../theme/index.js'` call site needs no change.
- `tone(token: SemanticColorToken)` is the same lookup but returns `undefined` (no colour prop
  at all) when the theme delegates to the terminal or the active theme is `mono` — new code
  should prefer this to the legacy flat getters, which always return a concrete string for
  backward compatibility with call sites typed that way before this file grew an engine.

## What needs one line of wiring in `app/App.tsx` (or `cli.tsx`)

- **Profile precedence.** Once `preferences/store.ts`'s `FilePreferenceStore.get({ nodeOrigin,
actorId })` resolves, call:

  ```ts
  import { resolveThemeWithUserThemes } from '../theme/themes/resolution.js';
  import { setActiveTheme } from '../theme/index.js';

  const { resolution, invalidUserThemeMessage } = await resolveThemeWithUserThemes({
    cliTheme: parsedArgs.themeName ?? null,
    envTheme: process.env.PATCHES_THEME ?? null,
    localTheme: storedPreferences?.theme ?? null,
  });
  if (resolution.ok) setActiveTheme(resolution.theme);
  if (invalidUserThemeMessage !== undefined) notify(invalidUserThemeMessage, 'error');
  ```

  This also picks up a JSON theme from `$XDG_CONFIG_HOME/patches/themes/<name>.json` for any
  name that isn't one of the six built-ins, validated by `theme/themes/schema.ts`. An invalid
  file falls back to `patches` and returns a message to toast — never a crash (P12-101).

- **Live reactivity everywhere**, not just on the next incidental re-render: wrap the app (or
  just the components that need it) with a subscriber via `useThemeDefinition()` from
  `theme/index.ts` (backed by `useSyncExternalStore`, no `<Provider>` needed). `Toast`, `Loading`,
  `Banner` and `ProgressBar` in `components/` already do this themselves.

## Glyph sets (P12-103)

`theme/glyphs.ts` exports `glyph(name, set)` and `resolveGlyphSet({ envGlyphSet, preferredGlyphSet,
locale })` — precedence `PATCHES_GLYPHS` env > persisted preference > auto (unicode unless the
locale isn't UTF-8, in which case ascii; nerd is never auto-detected). Call sites that render a
glyph (`PostRow`, `Toast`, a future `Ribbon`) should resolve the set once (e.g. via a small
context, mirroring `theme/plain-mode.tsx`'s `PlainModeProvider`) rather than recomputing per row.

## User themes

Drop a JSON file at `$XDG_CONFIG_HOME/patches/themes/<name>.json` (default
`~/.config/patches/themes/<name>.json`):

```json
{
  "name": "sunset",
  "colors": {
    "background": "#1a0f0f",
    "foreground": "#fdf3e7",
    "muted": "#c9a98f",
    "accent": "#ff8a5b",
    "ok": "#8bd17c",
    "warn": "#f2c14e",
    "error": "#e8555a",
    "border": "#c9a98f",
    "selection": "#4a2a2a",
    "link": "#7fd1e0",
    "mention": "#ffb37f",
    "tag": "#a3d977",
    "focus": "#ffd27f",
    "surfaceDim": "#0d0808"
  },
  "preferredGlyphSet": "unicode",
  "backgroundMode": "paint"
}
```

Every one of the 13 semantic tokens (`theme/themes/types.ts`'s `SEMANTIC_COLOR_TOKENS`) is
required — a theme that silently omits one is exactly the "quietly unreadable on some
background" bug this validation exists to catch. Each value is a 6-digit hex colour or `null`
(delegate that token to the terminal's own palette). `preferredGlyphSet` and `backgroundMode`
default to `"unicode"`/`"paint"` if omitted. Select it with `--theme sunset`, `PATCHES_THEME=sunset`,
or the `,` preferences screen's theme picker (`PreferencesScreen.tsx`, this package's own file).

## `AnyThemeDefinition` vs `ThemeDefinition`

`ThemeDefinition` (`theme/themes/types.ts`) stays narrow — `name: BuiltInThemeName` — because
most of the app (notably `app/App.tsx`'s theme state) is typed against exactly the six built-in
names. `AnyThemeDefinition` widens `name` to `string` for the one path that legitimately needs
it: loading and applying a user JSON theme (`schema.ts`, `load.ts`,
`resolveThemeWithUserThemes`, `theme/index.ts`'s own provider). A `ThemeDefinition` is always a
valid `AnyThemeDefinition`; the reverse isn't guaranteed, which is why `setActiveTheme` accepts
the wider type but `getBuiltInTheme`/`BUILT_IN_THEMES` keep returning the narrow one.
