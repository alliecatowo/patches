import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

import { safetyNumber as computeSafetyNumber } from '@patches/crypto';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import type { ActiveSession } from '../auth/session.js';
import { theme } from '../theme/index.js';
import { Loading } from '../components/Loading.js';

export interface SafetyNumberScreenProps {
  api: PatchesApi;
  session: ActiveSession;
  isActive: boolean;
  targetActorId: string;
  ensureAccessToken: () => Promise<string>;
  /** True when this peer's safety number was already compared and confirmed. */
  verified?: boolean | undefined;
  /** `v` — record that the viewer compared the number out-of-band. Session-scoped. */
  onMarkVerified?: (() => void) | undefined;
  onBack: () => void;
}

type SafetyState =
  | { status: 'loading' }
  | { status: 'ready'; number: string; targetHandle: string }
  | { status: 'error'; error: FriendlyError };

/**
 * Safety number screen for an E2EE conversation (P13-010).
 * Fetches both actors' identity roots, derives the canonical 60-digit safety number
 * (`@patches/crypto`'s `safetyNumber` — one implementation, shared with every other
 * client), and prompts the viewer to compare it out-of-band.
 */
export function SafetyNumberScreen({
  api,
  session,
  isActive,
  targetActorId,
  ensureAccessToken,
  verified,
  onMarkVerified,
  onBack,
}: SafetyNumberScreenProps): ReactElement {
  const [state, setState] = useState<SafetyState>(() =>
    session.actor?.id === undefined
      ? {
          status: 'error',
          error: { title: 'No actor ID on session.', hint: '', retryable: false, code: 0 },
        }
      : { status: 'loading' },
  );

  useEffect(() => {
    let cancelled = false;
    const myActorId = session.actor?.id;
    if (myActorId === undefined) return;
    Promise.all([
      ensureAccessToken().then((token) => api.getIdentityRoot({ actorId: myActorId }, token)),
      ensureAccessToken().then((token) => api.getIdentityRoot({ actorId: targetActorId }, token)),
      api.getActor({ id: targetActorId }),
    ])
      .then(([myResponse, theirResponse, actorResponse]) => {
        if (cancelled) return;
        const myKey = myResponse.identityRoot?.publicKey;
        const theirKey = theirResponse.identityRoot?.publicKey;
        if (
          myKey === undefined ||
          theirKey === undefined ||
          myResponse.identityRoot?.actorId === undefined ||
          theirResponse.identityRoot?.actorId === undefined
        ) {
          setState({
            status: 'error',
            error: {
              title: 'Could not retrieve identity keys.',
              hint: '',
              retryable: false,
              code: 0,
            },
          });
          return;
        }
        setState({
          status: 'ready',
          number: computeSafetyNumber(
            myResponse.identityRoot.actorId,
            myKey,
            theirResponse.identityRoot.actorId,
            theirKey,
          ),
          targetHandle: actorResponse.actor?.handle ?? targetActorId,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', error: describeGrpcError(error, api.target) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, ensureAccessToken, session.actor?.id, targetActorId]);

  useInput(
    (input, key) => {
      if (key.escape || input === 'q') onBack();
      if (input === 'v' && state.status === 'ready') onMarkVerified?.();
    },
    { isActive },
  );

  if (state.status === 'loading') return <Loading label="Calculating safety number..." />;
  if (state.status === 'error') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color={theme.error}>Failed to calculate safety number</Text>
        <Text>{state.error.title}</Text>
        <Text color={theme.muted}>Esc back</Text>
      </Box>
    );
  }

  // Split 60-digit number into two rows of 30 (6 groups each)
  const parts = state.number.split(/(.{30})/u).filter((part) => part !== '');
  const groups = parts.flatMap((part) => part.match(/.{5}/gu) ?? []);
  const rowsOf6 = [groups.slice(0, 6).join(' '), groups.slice(6, 12).join(' ')];

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Safety Number · @{state.targetHandle}</Text>
      <Text color={verified ? theme.ok : theme.warn}>
        {verified ? 'Verified — you compared this number.' : 'Not verified yet.'}
      </Text>
      <Box flexDirection="column" paddingX={1}>
        {rowsOf6.map((row, index) => (
          <Text key={index} color={theme.accent} bold>
            {row}
          </Text>
        ))}
      </Box>
      <Text color={theme.muted} wrap="wrap">
        Compare this number with @{state.targetHandle} over a trusted out-of-band channel to confirm
        your conversation is not being intercepted.
      </Text>
      {onMarkVerified === undefined ? null : (
        <Text color={theme.muted}>v mark as compared (this session)</Text>
      )}
      <Text color={theme.muted}>Esc or q — back</Text>
    </Box>
  );
}
