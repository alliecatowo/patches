/**
 * The `needs-authority` outcome of `enrollThisDevice` (ADR 0037 §2): this browser found a
 * published messaging identity it does not hold. Exactly three fixed-copy outcomes — link,
 * rotate, cancel — no fourth option deletes anything. `NeedsAuthorityChooser` renders the
 * choice; `RotateConfirmDialog` gates rotation behind the ADR §2 warning; `LinkThisDevicePanel`
 * (own file) handles the link path. `NeedsAuthorityFlow` composes all three.
 */
import { useState, type JSX } from 'react';

import {
  rotateMessagingRoot,
  DeviceLinkError,
  DEVICE_LINK_ERROR_COPY,
} from '../../e2ee/device-link.js';
import { NEEDS_AUTHORITY_COPY } from '../../e2ee/enrollment.js';
import type { EnrollmentTransport } from '../../e2ee/enrollment.js';
import type { RatchetSessionVault } from '../../e2ee/vault.js';
import { LinkThisDevicePanel } from './LinkThisDevicePanel.js';

export type NeedsAuthorityResolution = 'enrolled' | 'cancelled';

export interface NeedsAuthorityChooserProps {
  readonly onChoose: (option: 'link' | 'rotate' | 'cancel') => void;
}

/** The fixed three-option chooser (ADR 0037 §2). Exported separately so it can be tested
 * on its own for exactly the three dispatched options. */
export function NeedsAuthorityChooser({ onChoose }: NeedsAuthorityChooserProps): JSX.Element {
  return (
    <div role="group" aria-label="This device cannot enroll on its own">
      <p>{NEEDS_AUTHORITY_COPY.summary}</p>
      <button type="button" onClick={() => onChoose('link')}>
        {NEEDS_AUTHORITY_COPY.link}
      </button>
      <button type="button" onClick={() => onChoose('rotate')}>
        {NEEDS_AUTHORITY_COPY.rotate}
      </button>
      <button type="button" onClick={() => onChoose('cancel')}>
        {NEEDS_AUTHORITY_COPY.cancel}
      </button>
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
    <div role="alertdialog" aria-label="Start a new messaging identity">
      <p>{NEEDS_AUTHORITY_COPY.rotate}</p>
      {errorCopy === undefined ? null : <p role="alert">{errorCopy}</p>}
      <button type="button" onClick={onConfirm} disabled={pending}>
        {pending ? 'Starting a new identity…' : 'Start a new identity'}
      </button>
      <button type="button" onClick={onCancel} disabled={pending}>
        {NEEDS_AUTHORITY_COPY.cancel}
      </button>
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
      setRotateError(
        error instanceof DeviceLinkError ? error.message : DEVICE_LINK_ERROR_COPY['no-remote-root'],
      );
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
