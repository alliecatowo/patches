import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

import { safetyNumber as computeSafetyNumber } from '@patches/crypto';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import type { ActiveSession } from '../auth/session.js';
import { identityRootFromWire, strictVerifier, verifyActorChain } from '../e2ee/chain.js';
import { verifyIdentityRoot } from '@patches/domain';
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
  | { status: 'ready'; number: string; targetHandle: string; chainVerified: boolean }
  | { status: 'error'; error: FriendlyError };

/**
 * Safety number screen for an E2EE conversation (P13-010, B-101).
 *
 * The displayed number is derived only from keys that survived client-side
 * verification: the peer's identity root must carry a valid self-signature and its
 * published device roster must verify root → roster → certificates. A chain that fails
 * verification is never silently rendered as a comparable number — that would invite
 * comparing against exactly the substitution the out-of-band check exists to catch.
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
          error: { title: 'No account on this session.', hint: '', retryable: false, code: 0 },
        }
      : { status: 'loading' },
  );

  useEffect(() => {
    let cancelled = false;
    const myActorId = session.actor?.id;
    if (myActorId === undefined) return;
    void (async () => {
      try {
        const [myResponse, theirResponse, actorResponse, rosterResponse] = await Promise.all([
          ensureAccessToken().then((token) => api.getIdentityRoot({ actorId: myActorId }, token)),
          ensureAccessToken().then((token) =>
            api.getIdentityRoot({ actorId: targetActorId }, token),
          ),
          api.getActor({ id: targetActorId }),
          api.getDeviceRoster({ actorId: targetActorId }),
        ]);
        if (cancelled) return;
        const myRoot = myResponse.identityRoot;
        const theirRoot = theirResponse.identityRoot;
        const theirRoster = rosterResponse.roster;
        if (
          myRoot?.publicKey === undefined ||
          theirRoot?.publicKey === undefined ||
          myRoot.actorId === '' ||
          theirRoot.actorId === ''
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
        let chainVerified = false;
        try {
          if (theirRoster === undefined) throw new Error('No device roster published.');
          // Verify the peer's published chain (root proof-of-possession → signed roster →
          // each active device certificate) before its keys may be consumed.
          verifyActorChain({
            rootWire: theirRoot,
            rosterWire: theirRoster,
            certificatesWire: rosterResponse.certificates ?? [],
            now: new Date(),
          });
          chainVerified = true;
        } catch {
          chainVerified = false;
        }
        // The viewer's own root needs proof of possession (self-signature) before it
        // feeds the canonical fingerprint; a failed self-check also gates `v`.
        let selfVerified = false;
        try {
          verifyIdentityRoot(identityRootFromWire(myRoot), { verifier: strictVerifier });
          selfVerified = true;
        } catch {
          selfVerified = false;
        }
        setState({
          status: 'ready',
          number: computeSafetyNumber(
            myRoot.actorId,
            myRoot.publicKey,
            theirRoot.actorId,
            theirRoot.publicKey,
          ),
          targetHandle: actorResponse.actor?.handle ?? targetActorId,
          chainVerified: chainVerified && selfVerified,
        });
      } catch (error) {
        if (!cancelled) {
          setState({ status: 'error', error: describeGrpcError(error, api.target) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, ensureAccessToken, session.actor?.id, targetActorId]);

  useInput(
    (input, key) => {
      if (key.escape || input === 'q') onBack();
      if (input === 'v' && state.status === 'ready' && state.chainVerified) onMarkVerified?.();
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
      {state.chainVerified ? (
        <>
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
            Compare this number with @{state.targetHandle} over a trusted out-of-band channel to
            confirm your conversation is not being intercepted.
          </Text>
        </>
      ) : (
        <Text color={theme.error} wrap="wrap">
          This account's published identity keys failed signature verification, so no safety number
          is shown: the digits below could have been substituted along with the keys. Re-open this
          screen once the failure is understood.
        </Text>
      )}
      {onMarkVerified === undefined ? null : (
        <Text color={theme.muted}>
          {state.chainVerified
            ? 'v mark as compared (this session)'
            : 'v unavailable — keys failed verification'}
        </Text>
      )}
      <Text color={theme.muted}>Esc or q — back</Text>
    </Box>
  );
}
