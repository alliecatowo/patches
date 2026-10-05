import type { JSX } from 'react';

import { Button, ButtonGroup, Panel } from './ui/index.js';
import styles from './DemoSetupScreen.module.css';

export type SetupPhase = 'account' | 'keys' | 'friends' | 'ready';

const ORDER: readonly SetupPhase[] = ['account', 'keys', 'friends', 'ready'];

export interface DemoSetupScreenProps {
  /** The step currently running; every earlier step shows as done. */
  readonly phase: SetupPhase;
  readonly friendsDone: number;
  readonly friendsTotal: number;
  /** Set when `phase` failed; the step keeps its place and the actions appear. */
  readonly error?: string | undefined;
  /** Hides Retry, for failures where trying again straight away cannot help (rate limit). */
  readonly canRetry?: boolean;
  readonly onRetry?: () => void;
  /** Leaves the setup screen: back to the landing page, or on to the app. */
  readonly onLeave?: () => void;
  readonly leaveLabel?: string;
}

function label(step: SetupPhase, done: number, total: number): string {
  switch (step) {
    case 'account':
      return 'Creating your account';
    case 'keys':
      return 'Generating your encryption keys';
    case 'friends':
      return `Friends are sending you messages (${String(done)}/${String(total)})`;
    case 'ready':
      return 'Ready';
  }
}

/**
 * The full-screen "Setting up your sandbox" screen (ADR 0044). Every row is driven by a real
 * event from the sandbox setup, never a timer: the account row finishes when `StartDemo`
 * answers, the keys row when this browser's messaging device is enrolled, the friends row
 * counts friends whose messages have all been sent.
 */
export function DemoSetupScreen({
  phase,
  friendsDone,
  friendsTotal,
  error,
  canRetry = true,
  onRetry,
  onLeave,
  leaveLabel = 'Back',
}: DemoSetupScreenProps): JSX.Element {
  const failed = error !== undefined;
  const current = ORDER.indexOf(phase);
  // The last row has no work behind it, so it reads as done once it is reached.
  const allDone = phase === 'ready' && !failed;

  return (
    <div
      className={styles['screen']}
      role="dialog"
      aria-modal="true"
      aria-label="Setting up your sandbox"
    >
      <Panel
        eyebrow="patches demo"
        title={failed ? 'Your sandbox did not finish' : 'Setting up your sandbox'}
        description={
          failed
            ? undefined
            : 'A throwaway account, three fake friends and real encrypted messages. This takes about half a minute.'
        }
        centered
        tone={failed ? 'alert' : 'default'}
      >
        <ol className={styles['steps']} aria-label="Setup progress">
          {ORDER.map((step, index) => {
            const status: 'done' | 'active' | 'failed' | 'pending' =
              index < current || (allDone && index === current)
                ? 'done'
                : index === current
                  ? failed
                    ? 'failed'
                    : 'active'
                  : 'pending';
            return (
              <li
                key={step}
                className={`${styles['step']} ${styles[status]}`}
                aria-current={status === 'active' ? 'step' : undefined}
              >
                <span className={styles['marker']} aria-hidden="true">
                  {status === 'done' ? '✓' : status === 'failed' ? '!' : ''}
                </span>
                <span>{label(step, friendsDone, friendsTotal)}</span>
                <span className={styles['sr']}>
                  {status === 'done'
                    ? ', done'
                    : status === 'failed'
                      ? ', failed'
                      : status === 'active'
                        ? ', in progress'
                        : ', waiting'}
                </span>
              </li>
            );
          })}
        </ol>
        {failed ? (
          <>
            <p className={styles['error']} role="alert">
              {error}
            </p>
            <ButtonGroup>
              {canRetry && onRetry !== undefined ? (
                <Button variant="primary" onClick={onRetry}>
                  Try again
                </Button>
              ) : null}
              {onLeave !== undefined ? (
                <Button variant="secondary" onClick={onLeave}>
                  {leaveLabel}
                </Button>
              ) : null}
            </ButtonGroup>
          </>
        ) : (
          <p className={styles['sr']} role="status">
            {label(phase, friendsDone, friendsTotal)}
          </p>
        )}
      </Panel>
    </div>
  );
}
