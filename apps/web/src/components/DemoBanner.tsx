import { useEffect, useState, type JSX } from 'react';

import { leaveDemo } from '../api/client.js';
import { useSession } from '../hooks/useSession.js';
import { activeDemo, DEMO_ACTIVE, loadSeedPlan } from '../demo/demo-mode.js';
import { useDemoSeeding } from '../demo/useDemoSeeding.js';
import styles from './DemoBanner.module.css';

/** "57 minutes", "4 minutes", "under a minute". */
export function formatRemaining(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return 'under a minute';
  return `${String(minutes)} minutes`;
}

function SeedStatus(): JSX.Element | null {
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

/**
 * Shown on every screen of a demo sandbox (ADR 0044): what this is, when it disappears, and a
 * way out. When the sandbox ends the page returns to the landing page on its own.
 */
export function DemoBanner(): JSX.Element | null {
  const [now, setNow] = useState(() => Date.now());
  // Evaluated once per mount: the seeder must only be mounted for a freshly started sandbox.
  const [seeding] = useState(() => loadSeedPlan() !== undefined);

  useEffect(() => {
    if (!DEMO_ACTIVE) return undefined;
    const timer = setInterval(() => {
      const state = activeDemo();
      if (state === undefined) {
        leaveDemo();
        return;
      }
      setNow(Date.now());
    }, 15_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const state = DEMO_ACTIVE ? activeDemo(now) : undefined;
  if (state === undefined) return null;

  return (
    <aside className={styles['banner']} aria-label="Demo sandbox">
      <p>
        <strong>Demo sandbox.</strong> Everything here is fake and is deleted in{' '}
        {formatRemaining(state.expiresAtMs - now)}.{seeding ? <SeedStatus /> : null}
      </p>
      <button type="button" className={styles['leave']} onClick={leaveDemo}>
        Leave demo
      </button>
    </aside>
  );
}
