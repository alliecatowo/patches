import type { JSX } from 'react';

import { useSession } from '../hooks/useSession.js';
import { useDemoSeeding } from '../demo/useDemoSeeding.js';

/** Progress of the one-off inbox sealing, shown inside the demo banner. */
export default function DemoSeedStatus(): JSX.Element | null {
  const state = useDemoSeeding(useSession());
  if (state === 'running') {
    return <span role="status"> Sealing your encrypted inbox…</span>;
  }
  if (state === 'failed') {
    return (
      <span role="status">
        {' '}
        The sample messages could not be set up, but everything else works.
      </span>
    );
  }
  return null;
}
