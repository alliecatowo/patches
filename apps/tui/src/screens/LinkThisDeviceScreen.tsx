import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import { theme } from '../theme/index.js';
import { Loading } from '../components/Loading.js';
import { NEEDS_AUTHORITY_COPY } from '../e2ee/enrollment.js';

/** ADR 0037 §1: the SAS the offering device compares out of band against the authority's
 * own display. */
const SAS_INSTRUCTION_COPY =
  'Compare this code on a device that already has your messaging identity, then approve ' +
  'it there.';

export interface LinkThisDeviceScreenProps {
  isActive: boolean;
  /** ADR 0037 §1 step 1: posts this device's link offer and returns its SAS. */
  onBeginLink: () => Promise<{
    readonly linkId: string;
    readonly sas: string;
    readonly expiresAtMs: number;
  }>;
  /** ADR 0037 §1 step 4: polls once for the authority's approval. */
  onPollLink: () => Promise<'pending' | 'enrolled' | 'expired'>;
  /** ADR 0037 §2: mints and publishes the next root generation. */
  onRotateRoot: () => Promise<{ readonly generation: number; readonly planned: boolean }>;
  /** Fires once the new device is enrolled (either path) — the caller returns to Devices. */
  onDone: () => void;
  onBack: () => void;
  /** Injectable for tests; defaults to 3000ms (ADR 0037 §1). */
  pollIntervalMs?: number;
}

type ChooserState = { readonly status: 'choosing' };
type LinkState =
  | { readonly status: 'starting-link' }
  | { readonly status: 'waiting-link'; readonly sas: string; readonly expiresAtMs: number }
  | { readonly status: 'link-enrolled' }
  | { readonly status: 'link-expired' }
  | { readonly status: 'link-error'; readonly message: string };
type RotateState =
  | { readonly status: 'confirming-rotate' }
  | { readonly status: 'rotating' }
  | { readonly status: 'rotated'; readonly generation: number; readonly planned: boolean }
  | { readonly status: 'rotate-error'; readonly message: string };

type FlowState = ChooserState | LinkState | RotateState;

function sasGroups(sas: string): readonly string[] {
  return sas.split('-');
}

function formatCountdown(expiresAtMs: number, nowMs: number): string {
  const remainingMs = Math.max(0, expiresAtMs - nowMs);
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1_000);
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

/**
 * ADR 0037 §2 chooser plus §1's SAS-comparison screen: reached when enrollment finds a
 * published messaging root this device cannot reach. `link` starts a device-link offer
 * and polls for the authority's approval; `rotate` confirms the ADR 0037 §2 warning and
 * mints a fresh root generation; `cancel` leaves the account exactly as it was found. No
 * QR — the SAS is decimal digits so this works over a plain terminal (ADR 0037 §1's
 * terminal requirement).
 */
export function LinkThisDeviceScreen({
  isActive,
  onBeginLink,
  onPollLink,
  onRotateRoot,
  onDone,
  onBack,
  pollIntervalMs = 3_000,
}: LinkThisDeviceScreenProps): ReactElement {
  const [state, setState] = useState<FlowState>({ status: 'choosing' });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pollingRef = useRef(false);

  async function startLink(): Promise<void> {
    setState({ status: 'starting-link' });
    try {
      const offer = await onBeginLink();
      setState({ status: 'waiting-link', sas: offer.sas, expiresAtMs: offer.expiresAtMs });
    } catch (error) {
      setState({
        status: 'link-error',
        message: error instanceof Error ? error.message : 'Could not start device linking.',
      });
    }
  }

  useEffect(() => {
    if (state.status !== 'waiting-link') return;
    let cancelled = false;
    const timer = setInterval(() => {
      setNowMs(Date.now());
      if (pollingRef.current) return;
      pollingRef.current = true;
      void onPollLink()
        .then((result) => {
          if (cancelled) return;
          if (result === 'enrolled') setState({ status: 'link-enrolled' });
          else if (result === 'expired') setState({ status: 'link-expired' });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setState({
            status: 'link-error',
            message: error instanceof Error ? error.message : 'Could not check link status.',
          });
        })
        .finally(() => {
          pollingRef.current = false;
        });
    }, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state.status, onPollLink, pollIntervalMs]);

  async function confirmRotate(): Promise<void> {
    setState({ status: 'rotating' });
    try {
      const result = await onRotateRoot();
      setState({ status: 'rotated', generation: result.generation, planned: result.planned });
    } catch (error) {
      setState({
        status: 'rotate-error',
        message: error instanceof Error ? error.message : 'Could not start a new identity.',
      });
    }
  }

  useInput(
    (input, key) => {
      if (state.status === 'choosing') {
        if (input === 'l') void startLink();
        else if (input === 'r') setState({ status: 'confirming-rotate' });
        else if (input === 'c' || key.escape) onBack();
        return;
      }
      if (state.status === 'starting-link' || state.status === 'rotating') return;
      if (state.status === 'waiting-link') {
        if (key.escape) setState({ status: 'choosing' });
        return;
      }
      if (state.status === 'link-enrolled') {
        if (key.return || key.escape) onDone();
        return;
      }
      if (state.status === 'link-expired') {
        if (input === 'r') void startLink();
        else if (key.escape) setState({ status: 'choosing' });
        return;
      }
      if (state.status === 'link-error') {
        if (key.escape) setState({ status: 'choosing' });
        return;
      }
      if (state.status === 'confirming-rotate') {
        if (input === 'y' || key.return) void confirmRotate();
        else if (input === 'n' || key.escape) setState({ status: 'choosing' });
        return;
      }
      if (state.status === 'rotated') {
        if (key.return || key.escape) onDone();
        return;
      }
      if (state.status === 'rotate-error') {
        if (key.escape) setState({ status: 'choosing' });
      }
    },
    { isActive },
  );

  if (state.status === 'choosing') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color={theme.accent}>
          Link or start a new identity
        </Text>
        <Text wrap="wrap">{NEEDS_AUTHORITY_COPY.summary}</Text>
        <Box flexDirection="column">
          <Text wrap="wrap">l — {NEEDS_AUTHORITY_COPY.link}</Text>
          <Text wrap="wrap" color={theme.warn}>
            r — {NEEDS_AUTHORITY_COPY.rotate}
          </Text>
          <Text>c — {NEEDS_AUTHORITY_COPY.cancel}</Text>
        </Box>
      </Box>
    );
  }

  if (state.status === 'starting-link') return <Loading label="Starting device link..." />;

  if (state.status === 'waiting-link') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color={theme.accent}>
          Compare this code
        </Text>
        <Box flexDirection="column" paddingX={1}>
          {sasGroups(state.sas).map((group, index) => (
            <Text key={index} color={theme.accent} bold>
              {group}
            </Text>
          ))}
        </Box>
        <Text wrap="wrap">{SAS_INSTRUCTION_COPY}</Text>
        <Text color={theme.muted}>Expires in {formatCountdown(state.expiresAtMs, nowMs)}</Text>
        <Text color={theme.muted}>Waiting for approval... · Esc cancel</Text>
      </Box>
    );
  }

  if (state.status === 'link-enrolled') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color={theme.ok} bold>
          This device is now linked and enrolled for encrypted messages.
        </Text>
        <Text color={theme.muted}>Enter/Esc continue</Text>
      </Box>
    );
  }

  if (state.status === 'link-expired') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color={theme.warn} wrap="wrap">
          That link request expired before it was approved.
        </Text>
        <Text color={theme.muted}>r retry · Esc back</Text>
      </Box>
    );
  }

  if (state.status === 'link-error') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color={theme.error} wrap="wrap">
          {state.message}
        </Text>
        <Text color={theme.muted}>Esc back</Text>
      </Box>
    );
  }

  if (state.status === 'confirming-rotate') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color={theme.warn} wrap="wrap">
          {NEEDS_AUTHORITY_COPY.rotate}
        </Text>
        <Text color={theme.muted}>y/Enter start a new identity · n/Esc cancel</Text>
      </Box>
    );
  }

  if (state.status === 'rotating') return <Loading label="Starting a new messaging identity..." />;

  if (state.status === 'rotated') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color={theme.ok} bold wrap="wrap">
          Started messaging identity generation {String(state.generation)}
          {state.planned
            ? ''
            : ' (unverified reset — your contacts will see a hard identity-change warning until they acknowledge it)'}
          .
        </Text>
        <Text color={theme.muted}>Enter/Esc continue</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color={theme.error} wrap="wrap">
        {state.message}
      </Text>
      <Text color={theme.muted}>Esc back</Text>
    </Box>
  );
}
