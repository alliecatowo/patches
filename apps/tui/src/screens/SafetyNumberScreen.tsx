import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { createHash } from 'node:crypto';

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
  onBack: () => void;
}

type SafetyState =
  | { status: 'loading' }
  | { status: 'ready'; number: string; targetHandle: string }
  | { status: 'error'; error: FriendlyError };

/** Produce a 60-character safety number from two 32-byte Ed25519 public keys.
 * Symmetric: sort keys before hashing so both sides get the same digits. */
function formatSafetyNumber(myKey: Uint8Array, theirKey: Uint8Array): string {
  // Lexicographic ordering makes the number symmetric across both sides
  const [first, second] =
    Buffer.compare(Buffer.from(myKey), Buffer.from(theirKey)) <= 0
      ? [myKey, theirKey]
      : [theirKey, myKey];

  const hash = createHash('sha512').update(Buffer.from(first)).update(Buffer.from(second)).digest();

  // Map bytes to decimal groups of 5 digits (matching Signal safety number format)
  // Take 30 bytes → 12 groups of 5 decimal digits
  const groups: string[] = [];
  for (let i = 0; i < 30; i += 5) {
    const chunk = hash.subarray(i, i + 5);
    // Read as big-endian uint40
    const n =
      (BigInt(chunk[0] ?? 0) << 32n) |
      (BigInt(chunk[1] ?? 0) << 24n) |
      (BigInt(chunk[2] ?? 0) << 16n) |
      (BigInt(chunk[3] ?? 0) << 8n) |
      BigInt(chunk[4] ?? 0);
    // Modulo 100000 to produce a 5-digit group
    groups.push(String(n % 100000n).padStart(5, '0'));
  }
  return groups.join(' ');
}

/**
 * Safety number screen for an E2EE conversation (P13-010).
 * Fetches both actors' identity roots, derives a deterministic 60-digit
 * safety number, and prompts the user to verify it out-of-band.
 */
export function SafetyNumberScreen({
  api,
  session,
  isActive,
  targetActorId,
  ensureAccessToken,
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
        if (myKey === undefined || theirKey === undefined) {
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
          number: formatSafetyNumber(myKey, theirKey),
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

  // Split 60-char number into two rows of 30 (6 groups each)
  const parts = state.number.split(' ');
  const row1 = parts.slice(0, 6).join(' ');
  const row2 = parts.slice(6, 12).join(' ');

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Safety Number · @{state.targetHandle}</Text>
      <Box flexDirection="column" paddingX={1}>
        <Text color={theme.accent} bold>
          {row1}
        </Text>
        <Text color={theme.accent} bold>
          {row2}
        </Text>
      </Box>
      <Text color={theme.muted} wrap="wrap">
        Compare this number with @{state.targetHandle} over a trusted out-of-band channel to confirm
        your conversation is not being intercepted.
      </Text>
      <Text color={theme.muted}>Esc or q — back</Text>
    </Box>
  );
}
