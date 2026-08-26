import { present } from '../api/present.js';
import type { Nameplate as NameplateT } from '../api/wire/types.js';
import { Text } from 'ink';
import type { ReactElement } from 'react';

import { sanitizeForTerminal } from '../format/sanitize.js';
import { usePlainMode } from '../theme/plain-mode.js';

export interface NameplateProps {
  handle: string;
  nameplate?: NameplateT | undefined;
  bold?: boolean;
  /** Color to use when the actor has no nameplate colour of its own (e.g. a
   * selection highlight) — a nameplate colour always wins over this. */
  fallbackColor?: string | undefined;
  /** Renders this text instead of `@handle` — B-130: a display name in a profile
   * context gets the same nameplate treatment (colour + glyph) as the handle. */
  text?: string | undefined;
}

/**
 * `@handle`, optionally styled by the actor's server-attested nameplate (spec §173):
 * a colour (or the first stop of a "start,end" gradient pair — Ink's `<Text>` has no
 * gradient primitive) and a single narrow glyph. Truecolor → 256 → 16-colour → none
 * degradation is Ink/chalk's own job, not this component's: chalk auto-detects the
 * terminal's actual `getColorDepth()` (and honours `NO_COLOR`) and downsamples any
 * hex colour it's given accordingly, so passing the hex straight through already
 * degrades correctly everywhere from a real terminal to a piped/CI shell. A
 * nameplate is never required to read a post (§173) — `nameplate` is optional and
 * this renders a plain `@handle` without one. Plain mode (§173's required toggle —
 * `usePlainMode()`, `PATCHES_PLAIN=1`/`--plain`/runtime `P`) strips the colour and
 * glyph unconditionally, same as having no nameplate at all.
 */
export function Nameplate({
  handle,
  nameplate,
  bold = false,
  fallbackColor,
  text,
}: NameplateProps): ReactElement {
  const plain = usePlainMode();
  const color = plain
    ? fallbackColor
    : ((present(nameplate) ? gradientFirstStop(nameplate.nameColor) : undefined) ?? fallbackColor);
  const glyph = plain || !present(nameplate) ? '' : sanitizeForTerminal(nameplate.glyph);
  const label = text !== undefined ? sanitizeForTerminal(text) : `@${sanitizeForTerminal(handle)}`;
  // `Text`'s `color` prop type has no `undefined` member (exactOptionalPropertyTypes
  // requires actually omitting the prop, not passing `color={undefined}`).
  return (
    <Text {...(color === undefined ? {} : { color })} bold={bold}>
      {glyph === '' ? '' : `${glyph} `}
      {label}
    </Text>
  );
}

/** `"#7C3AED"` as-is, or the first stop of a `"#7C3AED,#22D3EE"` gradient pair. */
function gradientFirstStop(nameColor: string): string | undefined {
  if (nameColor === '') return undefined;
  const [first] = nameColor.split(',');
  const trimmed = first?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
}
