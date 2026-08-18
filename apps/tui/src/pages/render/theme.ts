import type { PageTheme } from '@patches/domain';

/** Ink `Box.borderStyle` values a `PageTheme.border` can select — mirrors
 * `packages/domain`'s own `PAGE_BORDER_STYLES` vocabulary 1:1 (`single`/`double`/
 * `round`/`ascii`/`none`), so there is nothing left to validate here. */
export type InkBorderStyle = 'single' | 'double' | 'round' | 'classic' | undefined;

/** `packages/domain`'s `'ascii'` has no like-named Ink border — `'classic'` is Ink's
 * own all-ASCII box (`+`/`-`/`|`), the closest visual match. `'none'` and an absent
 * theme both mean "no border at all". */
export function borderStyleFor(border: PageTheme['border'] | undefined): InkBorderStyle {
  if (border === undefined || border === 'none') return undefined;
  if (border === 'ascii') return 'classic';
  return border;
}

/** A resolved, render-ready theme — plain mode strips every field to `undefined`
 * (spec §173: "MUST provide a plain mode that strips all decoration"), same treatment
 * `Nameplate`/`ProfileScreen` already give nameplate colour/border. Passing a hex/named
 * colour straight through `<Text color>`/`<Box borderColor>` already degrades
 * truecolor → 256 → 16 → none via Ink/chalk's own terminal detection — this function
 * only ever decides *whether* to pass a colour through, never how to downsample it. */
export interface ResolvedPageTheme {
  accent: string | undefined;
  border: InkBorderStyle;
}

export function resolvePageTheme(theme: PageTheme | undefined, plain: boolean): ResolvedPageTheme {
  if (plain || theme === undefined) return { accent: undefined, border: undefined };
  return {
    accent: theme.accent === '' ? undefined : theme.accent,
    border: borderStyleFor(theme.border),
  };
}
