import type { CosmeticColorDepth } from '@patches/domain';

/** Map Node's `WriteStream.getColorDepth()` bit counts to the domain colour-depth subset the
 * cosmetic-pack selectors understand. Falls back to `'16'` (the base ANSI palette) when the
 * interrogated stream isn't a terminal or lacks the API, since Ink/chalk still render a
 * text-mode frame at base colours even on a plain pipe. */
function mapDepth(depth: number): CosmeticColorDepth {
  if (depth >= 24) return 'truecolor';
  if (depth >= 8) return '256';
  return '16';
}

/** The terminal's advertised colour depth (B-117), so the TUI can feed the shared
 * cosmetic-pack selectors the same capability signal the web feeds via `prefers-reduced-motion`
 * and truecolour. Cheap and non-reactive — a resize mid-run is not worth re-rendering for. */
export function terminalColorDepth(): CosmeticColorDepth {
  const stdout = process.stdout as { getColorDepth?: () => number } | undefined;
  if (stdout && typeof stdout.getColorDepth === 'function') {
    return mapDepth(stdout.getColorDepth());
  }
  return '16';
}
