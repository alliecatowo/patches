/**
 * New-device side of ADR 0037 §1: posts this browser's link offer, shows the SAS as five
 * 4-digit groups in large monospace text, and polls for the authority device's approval.
 * Text only, no QR — the spec's terminal-parity requirement (§1 "the TUI renders it as text
 * with no QR dependency") applies equally to a headless/no-camera browser session.
 */
import { useEffect, useState, type JSX } from 'react';

import {
  beginDeviceLinkOffer,
  pollLinkedEnrollment,
  DeviceLinkError,
  DEVICE_LINK_ERROR_COPY,
} from '../../e2ee/device-link.js';
import type { EnrollmentTransport } from '../../e2ee/enrollment.js';
import type { RatchetSessionVault } from '../../e2ee/vault.js';
import styles from './deviceLink.module.css';

/** ADR 0037 §1: how often the new device checks whether the authority has approved yet. */
const LINK_POLL_MS = 3_000;

export const LINK_PANEL_INSTRUCTION_COPY =
  'Compare this code on a device that already has your messaging identity, then approve it there';

export const LINK_PANEL_EXPIRED_COPY = 'This link request expired before it was approved.';

type LinkState =
  | { readonly kind: 'starting' }
  | { readonly kind: 'waiting'; readonly sas: string }
  | { readonly kind: 'expired' }
  | { readonly kind: 'error'; readonly copy: string };

export interface LinkThisDevicePanelProps {
  readonly actorId: string;
  readonly vault: RatchetSessionVault;
  readonly transport: EnrollmentTransport;
  readonly onEnrolled: () => void;
  readonly onCancel: () => void;
  /** Test seam only; defaults to the real poll cadence. */
  readonly pollIntervalMs?: number;
}

export function LinkThisDevicePanel(props: LinkThisDevicePanelProps): JSX.Element {
  const { actorId, vault, transport, onEnrolled, onCancel, pollIntervalMs = LINK_POLL_MS } = props;
  const [state, setState] = useState<LinkState>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void beginDeviceLinkOffer({ actorId, transport, vault, nowMs: () => Date.now() })
      .then((result) => {
        if (!cancelled) setState({ kind: 'waiting', sas: result.sas });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          copy:
            error instanceof DeviceLinkError
              ? error.message
              : DEVICE_LINK_ERROR_COPY['no-remote-root'],
        });
      });
    return () => {
      cancelled = true;
    };
    // `attempt` is the only reason this effect re-runs after the first mount (the retry button).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attempt is a deliberate re-run trigger, not a stale-closure risk (nothing else it reads changes across a retry)
  }, [actorId, attempt]);

  useEffect(() => {
    if (state.kind !== 'waiting') return undefined;
    const interval = setInterval(() => {
      void pollLinkedEnrollment({ actorId, transport, vault, nowMs: () => Date.now() }).then(
        (result) => {
          if (result === 'enrolled') onEnrolled();
          else if (result === 'expired') setState({ kind: 'expired' });
        },
      );
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [state.kind, actorId, transport, vault, onEnrolled, pollIntervalMs]);

  if (state.kind === 'starting') {
    return (
      <div className={styles['card']} role="status">
        <p className={styles['statusLine']}>
          <span className={styles['spinner']} aria-hidden="true" />
          Preparing this device…
        </p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className={styles['card']} role="alert">
        <p className={styles['alertText']}>{state.copy}</p>
        <button
          type="button"
          className={`${styles['optionButton']} ${styles['tertiary']}`}
          onClick={onCancel}
        >
          Cancel linking
        </button>
      </div>
    );
  }

  if (state.kind === 'expired') {
    return (
      <div className={styles['card']} role="alert">
        <p className={styles['alertText']}>{LINK_PANEL_EXPIRED_COPY}</p>
        <div className={styles['optionStack']}>
          <button
            type="button"
            className={`${styles['optionButton']} ${styles['secondary']}`}
            onClick={() => {
              setState({ kind: 'starting' });
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
          <button
            type="button"
            className={`${styles['optionButton']} ${styles['tertiary']}`}
            onClick={onCancel}
          >
            Cancel linking
          </button>
        </div>
      </div>
    );
  }

  const groups = state.sas.split('-');
  return (
    <div className={styles['card']} role="group" aria-label="Link this device">
      <p className={styles['instruction']}>{LINK_PANEL_INSTRUCTION_COPY}</p>
      <p aria-label="Safety code" className={styles['sasCode']}>
        {groups.join('  ')}
      </p>
      <p className={styles['statusLine']} role="status">
        <span className={styles['spinner']} aria-hidden="true" />
        Waiting for approval…
      </p>
      <button
        type="button"
        className={`${styles['optionButton']} ${styles['tertiary']}`}
        onClick={onCancel}
      >
        Cancel linking
      </button>
    </div>
  );
}
