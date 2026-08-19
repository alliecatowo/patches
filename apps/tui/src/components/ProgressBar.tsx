import { ProgressBar as InkProgressBar, defaultTheme, extendTheme, ThemeProvider } from '@inkjs/ui';
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

const PLAIN_BAR_WIDTH = 20;

function accentTheme(): typeof defaultTheme {
  // `@inkjs/ui`'s default is a hardcoded magenta; recolour to the active theme's accent when
  // it has one to give — `mono`/`terminal` fall back to `@inkjs/ui`'s own default styles
  // (empty overrides) rather than forcing a colour a zero-colour-code theme doesn't want.
  const accent = tone('accent');
  if (accent === undefined) return defaultTheme;
  return extendTheme(defaultTheme, {
    components: {
      ProgressBar: {
        styles: {
          completed: () => ({ color: accent }),
        },
      },
    },
  });
}

function plainBar(clamped: number): string {
  const filled = Math.round((clamped / 100) * PLAIN_BAR_WIDTH);
  return `[${'#'.repeat(filled)}${'-'.repeat(PLAIN_BAR_WIDTH - filled)}]`;
}

/**
 * Determinate upload progress (P12-025) — replaces a bare `Uploading foo… 42%` string with
 * `@inkjs/ui`'s bar plus the same percentage as text. Always exactly two rows in both rich and
 * plain mode (the restraint rule, design vision §3.6: decoration may never change a measured
 * height between modes) — plain mode swaps the coloured bar for a fixed-width ASCII one rather
 * than dropping the row.
 */
export function ProgressBar({ label, value }: ProgressBarProps): ReactElement {
  const plain = usePlainMode();
  const clamped = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text wrap="truncate-end">{`${label}… ${String(clamped)}%`}</Text>
      {plain ? (
        <Text>{plainBar(clamped)}</Text>
      ) : (
        <ThemeProvider theme={accentTheme()}>
          <InkProgressBar value={clamped} />
        </ThemeProvider>
      )}
    </Box>
  );
}
