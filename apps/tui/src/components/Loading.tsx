import { Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ReactElement } from 'react';

import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';

export interface LoadingProps {
  /** What is loading, without a trailing ellipsis — e.g. `Loading thread`. */
  label: string;
}

/**
 * The one loading indicator. Every "…" placeholder in the app goes through this so a
 * slow node looks like it is working rather than like it has hung.
 *
 * Plain mode (spec §173: "strips all decoration") drops the animation entirely and
 * renders the label alone — the same words, so a `waitForFrame`/screen-reader/
 * `--plain` user sees exactly what everyone else does.
 */
export function Loading({ label }: LoadingProps): ReactElement {
  const plain = usePlainMode();
  if (plain) {
    return <Text color={theme.muted}>{label}…</Text>;
  }
  return (
    <Text color={theme.muted}>
      <Spinner type="dots" /> {label}…
    </Text>
  );
}
