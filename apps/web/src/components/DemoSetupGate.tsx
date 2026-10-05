import { useEffect, type JSX } from 'react';

import { useSession } from '../hooks/useSession.js';
import { clearSeedPlan } from '../demo/demo-mode.js';
import { useDemoSeeding } from '../demo/useDemoSeeding.js';
import { DemoSetupScreen, type SetupPhase } from './DemoSetupScreen.js';

/** How long "Ready" stays up before the inbox opens; a person needs a beat to read it. */
const READY_HOLD_MS = 700;

export interface DemoSetupGateProps {
  /** Called once the sandbox is ready (or the visitor chose to continue without the messages). */
  readonly onFinished: () => void;
}

/**
 * The second half of the sandbox setup screen, shown after the page reloads onto the demo node:
 * enrolls the visitor's keys and has the friends send their messages, with real progress. A
 * reload while it runs lands back here and resumes (see `seedDemoInbox`), so it can never
 * start a second set of conversations. Lazy because it pulls in the whole E2EE runtime.
 */
export default function DemoSetupGate({ onFinished }: DemoSetupGateProps): JSX.Element | null {
  const seeding = useDemoSeeding(useSession());
  const { state, retry } = seeding;

  useEffect(() => {
    if (state === 'idle') {
      onFinished();
      return undefined;
    }
    if (state !== 'done') return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(onFinished, reduced ? 0 : READY_HOLD_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [state, onFinished]);

  if (state === 'idle') return null;
  const phase: SetupPhase =
    state === 'done' ? 'ready' : seeding.step === 'ready' ? 'friends' : seeding.step;
  return (
    <DemoSetupScreen
      phase={phase}
      friendsDone={seeding.friendsDone}
      friendsTotal={seeding.friendsTotal}
      error={state === 'failed' ? seeding.error : undefined}
      onRetry={retry}
      onLeave={() => {
        clearSeedPlan();
        onFinished();
      }}
      leaveLabel="Continue without messages"
    />
  );
}
