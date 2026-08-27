/**
 * The `needs-authority` outcome of `enrollThisDevice` (ADR 0037 §2): this browser found a
 * published messaging identity it does not hold. Exactly three fixed-copy outcomes — link,
 * rotate, cancel — no fourth option deletes anything. `NeedsAuthorityChooser` renders the
 * choice; `RotateConfirmDialog` gates rotation behind the ADR §2 warning; `LinkThisDevicePanel`
 * (own file) handles the link path. `NeedsAuthorityFlow` composes all three.
 */
import { Code, ConnectError } from '@connectrpc/connect';
import { useState, type JSX } from 'react';

import { rotateMessagingRoot, DeviceLinkError } from '../../e2ee/device-link.js';
import { NEEDS_AUTHORITY_COPY } from '../../e2ee/enrollment.js';
import type { EnrollmentTransport } from '../../e2ee/enrollment.js';
import type { RatchetSessionVault } from '../../e2ee/vault.js';
import styles from './deviceLink.module.css';
import { LinkThisDevicePanel } from './LinkThisDevicePanel.js';

export type NeedsAuthorityResolution = 'enrolled' | 'cancelled';

export interface NeedsAuthorityChooserProps {
  readonly onChoose: (option: 'link' | 'rotate' | 'cancel') => void;
}

/** The fixed three-option chooser (ADR 0037 §2). Exported separately so it can be tested
 * on its own for exactly the three dispatched options. */
export function NeedsAuthorityChooser({ onChoose }: NeedsAuthorityChooserProps): JSX.Element {
  return (
    <div className={styles['card']} role="group" aria-label="This device cannot enroll on its own">
      <h2 className={styles['title']}>Set up messaging on this device</h2>
      <p className={styles['body']}>{NEEDS_AUTHORITY_COPY.summary}</p>
      <div className={styles['optionStack']}>
        <div className={styles['option']}>
          <button
            type="button"
            className={`${styles['optionButton']} ${styles['primary']}`}
            onClick={() => onChoose('link')}
            aria-describedby="needs-authority-link-desc"
          >
            Link this device
          </button>
          <p id="needs-authority-link-desc" className={styles['optionDesc']}>
            {NEEDS_AUTHORITY_COPY.link}
          </p>
        </div>
        <div className={styles['option']}>
          <button
            type="button"
            className={`${styles['optionButton']} ${styles['secondary']}`}
            onClick={() => onChoose('rotate')}
            aria-describedby="needs-authority-rotate-desc"
          >
            Start a new identity
          </button>
          <p id="needs-authority-rotate-desc" className={styles['optionDesc']}>
            {NEEDS_AUTHORITY_COPY.rotate}
          </p>
        </div>
        <div className={styles['option']}>
          <button
            type="button"
            className={`${styles['optionButton']} ${styles['tertiary']}`}
            onClick={() => onChoose('cancel')}
            aria-describedby="needs-authority-cancel-desc"
          >
            Cancel
          </button>
          <p id="needs-authority-cancel-desc" className={styles['optionDesc']}>
            Keep this device as it is; nothing changes.
          </p>
        </div>
      </div>
    </div>
  );
}

export interface RotateConfirmDialogProps {
  readonly pending: boolean;
  readonly errorCopy: string | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** The rotate confirmation gate: the ADR §2 copy already states history on lost devices is
 * not recoverable and that every contact will be warned — this dialog repeats it rather
 * than paraphrasing, so the confirmation and the chooser never say two different things. */
export function RotateConfirmDialog(props: RotateConfirmDialogProps): JSX.Element {
  const { pending, errorCopy, onConfirm, onCancel } = props;
  return (
    <div className={styles['card']} role="alertdialog" aria-label="Start a new messaging identity">
      <h2 className={styles['title']}>Start a new messaging identity?</h2>
      <p className={styles['body']}>{NEEDS_AUTHORITY_COPY.rotate}</p>
      {errorCopy === undefined ? null : (
        <p role="alert" className={styles['alertText']}>
          {errorCopy}
        </p>
      )}
      <div className={styles['optionStack']}>
        <button
          type="button"
          className={`${styles['optionButton']} ${styles['danger']}`}
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? 'Starting a new identity…' : 'Start new identity'}
        </button>
        <button
          type="button"
          className={`${styles['optionButton']} ${styles['tertiary']}`}
          onClick={onCancel}
          disabled={pending}
        >
          Go back
        </button>
      </div>
    </div>
  );
}

export interface NeedsAuthorityFlowProps {
  readonly actorId: string;
  readonly vault: RatchetSessionVault;
  readonly transport: EnrollmentTransport;
  readonly onResolved: (resolution: NeedsAuthorityResolution) => void;
}

type Phase = 'choice' | 'link' | 'rotate-confirm' | 'rotating';

/**
 * `rotateMessagingRoot` failed after the account already has a real, verifiable root and
 * roster — unlike the pre-flight `no-remote-root` case, silently relabelling every failure
 * as "no remote root" told a lie: the operator's own account was rejected by a real error
 * that had nothing to do with a missing root. `DeviceLinkError` already carries copy safe to
 * show verbatim; a `ConnectError`'s raw message can carry server internals, so only its
 * `Code` name (never `rawMessage`) surfaces; anything else gets a fixed, non-committal line.
 */
function describeRotateFailure(error: unknown): string {
  if (error instanceof DeviceLinkError) return error.message;
  if (error instanceof ConnectError) {
    return `The node refused this request (${Code[error.code]}). Nothing was changed.`;
  }
  return 'Something went wrong before any change was made. Try again.';
}

/** Composes the chooser with the link and rotate paths (ADR 0037 §2). The caller owns
 * refreshing whatever reads the stored enrollment record (e.g. `webE2ee()`'s manager)
 * once `onResolved('enrolled')` fires — this component only writes the vault. */
export function NeedsAuthorityFlow(props: NeedsAuthorityFlowProps): JSX.Element {
  const { actorId, vault, transport, onResolved } = props;
  const [phase, setPhase] = useState<Phase>('choice');
  const [rotateError, setRotateError] = useState<string | undefined>(undefined);

  function handleChoose(option: 'link' | 'rotate' | 'cancel'): void {
    if (option === 'cancel') {
      onResolved('cancelled');
      return;
    }
    setRotateError(undefined);
    setPhase(option === 'link' ? 'link' : 'rotate-confirm');
  }

  async function handleRotateConfirm(): Promise<void> {
    setPhase('rotating');
    setRotateError(undefined);
    try {
      await rotateMessagingRoot({ actorId, transport, vault, nowMs: () => Date.now() });
      onResolved('enrolled');
    } catch (error) {
      setRotateError(describeRotateFailure(error));
      setPhase('rotate-confirm');
    }
  }

  if (phase === 'choice') {
    return <NeedsAuthorityChooser onChoose={handleChoose} />;
  }

  if (phase === 'link') {
    return (
      <LinkThisDevicePanel
        actorId={actorId}
        vault={vault}
        transport={transport}
        onEnrolled={() => onResolved('enrolled')}
        onCancel={() => onResolved('cancelled')}
      />
    );
  }

  return (
    <RotateConfirmDialog
      pending={phase === 'rotating'}
      errorCopy={rotateError}
      onConfirm={() => void handleRotateConfirm()}
      onCancel={() => onResolved('cancelled')}
    />
  );
}
