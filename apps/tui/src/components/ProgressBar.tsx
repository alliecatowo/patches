import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { tone } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';

export interface ProgressBarProps {
  /** What is uploading, without a trailing percent — e.g. `Uploading photo.png`. */
  label: string;
  /** 0 through 100. */
  value: number;
}

const BAR_WIDTH = 20;

// The glyphs `figures.square`/`figures.squareLightShade` resolve to, inlined rather than
// pulling in `figures` as a direct dependency for two characters.
const FILLED_GLYPH = '█';
const EMPTY_GLYPH = '░';

function bar(clamped: number, filledChar: string, emptyChar: string): string {
  const filled = Math.round((clamped / 100) * BAR_WIDTH);
  return `${filledChar.repeat(filled)}${emptyChar.repeat(BAR_WIDTH - filled)}`;
}

/**
 * Determinate upload progress (P12-025) — replaces a bare `Uploading foo… 42%` string with a
 * bar plus the same percentage as text. Always exactly two rows in both rich and plain mode
 * (the restraint rule, design vision §3.6: decoration may never change a measured height
 * between modes) — plain mode swaps the coloured bar for an ASCII one rather than dropping
 * the row.
 *
 * The bar is a fixed width rather than one that fills the terminal, because it must not depend
 * on self-measurement. This previously used `@inkjs/ui`'s ProgressBar, which starts at width 0,
 * measures itself with `measureElement`, then calls `setWidth` during render to draw. Under
 * Ink 7 + React 19 that cycle never converges here: the bar stayed at width 0 indefinitely,
 * which also collapsed the column and truncated the `truncate-end` label to the empty string,
 * so the whole component rendered as two blank rows. A fixed width is deterministic, needs no
 * measurement pass, and keeps rich and plain mode identically sized.
 */
export function ProgressBar({ label, value }: ProgressBarProps): ReactElement {
  const plain = usePlainMode();
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  const accent = tone('accent');

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text wrap="truncate-end">{`${label}… ${String(clamped)}%`}</Text>
      {plain ? (
        <Text>{`[${bar(clamped, '#', '-')}]`}</Text>
      ) : // `tone` returns undefined for a zero-colour theme like `mono`, and
      // `exactOptionalPropertyTypes` forbids passing `color={undefined}`, so the
      // uncoloured bar is its own element rather than a conditional prop.
      accent === undefined ? (
        <Text>{bar(clamped, FILLED_GLYPH, EMPTY_GLYPH)}</Text>
      ) : (
        <Text color={accent}>{bar(clamped, FILLED_GLYPH, EMPTY_GLYPH)}</Text>
      )}
    </Box>
  );
}
