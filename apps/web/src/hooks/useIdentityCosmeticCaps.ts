import type { IdentityCosmeticCaps } from '@patches/domain';
import { useSyncExternalStore } from 'react';

import {
  getSystemPrefersReducedMotion,
  subscribeSystemPrefersReducedMotion,
} from '../lib/theme.js';

/**
 * Live `IdentityCosmeticCaps` for the web client (B-117). The web always has full colour and
 * never has a hard "plain mode" the way the TUI does, so the only capability that genuinely
 * varies at runtime here is `reducedMotion` (the `prefers-reduced-motion` media query) — every
 * cosmetic-packs selector then degrades its animated "pop" and glow accordingly. `highContrast`
 * stays `false`; a future site-wide high-contrast toggle can map onto it.
 */
export function useIdentityCosmeticCaps(): IdentityCosmeticCaps {
  const reducedMotion = useSyncExternalStore(
    subscribeSystemPrefersReducedMotion,
    getSystemPrefersReducedMotion,
    () => false,
  );
  return { plain: false, highContrast: false, reducedMotion, colorDepth: 'truecolor' };
}
